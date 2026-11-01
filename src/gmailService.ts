import { shell } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import {
  clearStoredGmailTokens,
  exchangeCodeForTokens,
  fetchAuthenticatedUserEmail,
  generatePkceCodes,
  getAuthorizationUrl,
  getGoogleOAuthCredentials,
  loadStoredGmailTokens,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  saveStoredGmailTokens,
  type GoogleOAuthCredentials,
  type StoredGmailTokens,
} from './gmailAuth';
import {
  base64UrlEncode,
  buildGmailMimeMessage,
  type MimeAttachment,
} from './gmailMime';

export interface GmailConnectionStatus {
  connected: boolean;
  email?: string;
  hasClientCredentials: boolean;
  clientId?: string;
}

export interface SendGmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  textBody?: string;
  htmlBody: string;
  senderName?: string;
  attachments?: MimeAttachment[];
}

export interface GmailSendResult {
  success: boolean;
  messageId: string;
  threadId?: string;
  senderEmail: string;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB Gmail limit

/**
 * Validates a basic email address syntax.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Checks the current Gmail OAuth connection status, verifying stored tokens.
 */
export async function getGmailStatus(
  db: DatabaseSync,
): Promise<GmailConnectionStatus> {
  const credentials = getGoogleOAuthCredentials(db);
  const stored = loadStoredGmailTokens(db);

  if (!stored) {
    return {
      connected: false,
      hasClientCredentials: Boolean(credentials?.clientId),
      clientId: credentials?.clientId,
    };
  }

  // If token is expired or within 3 minutes of expiry, try a quick refresh to confirm validity
  if (
    stored.refreshToken &&
    stored.expiryDate - Date.now() < 180000 &&
    credentials
  ) {
    try {
      const refreshed = await refreshGoogleAccessToken({
        refreshToken: stored.refreshToken,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      });

      stored.accessToken = refreshed.accessToken;
      stored.expiryDate = refreshed.expiryDate;
      saveStoredGmailTokens(stored, db);
    } catch (err) {
      console.warn(
        'Background Gmail token refresh failed on status check:',
        err,
      );
      // If refresh failed because token was revoked, clear credentials
      const msg = String(err);
      if (msg.includes('invalid_grant') || msg.includes('revoked')) {
        clearStoredGmailTokens(db);
        return {
          connected: false,
          hasClientCredentials: Boolean(credentials?.clientId),
          clientId: credentials?.clientId,
        };
      }
    }
  }

  return {
    connected: true,
    email: stored.email,
    hasClientCredentials: Boolean(credentials?.clientId),
    clientId: credentials?.clientId,
  };
}

/**
 * Initiates the Google OAuth 2.0 PKCE authorization flow using the system browser.
 */
export async function connectGmailAccount(
  db: DatabaseSync,
  customCredentials?: GoogleOAuthCredentials,
): Promise<{ success: boolean; email: string }> {
  const credentials = customCredentials || getGoogleOAuthCredentials(db);

  if (!credentials || !credentials.clientId?.trim()) {
    throw new Error(
      'Google OAuth Client ID is not configured. Please enter your OAuth Client ID in Settings.',
    );
  }

  const pkce = generatePkceCodes();
  return await executeBrowserOAuthFlow(db, credentials, pkce);
}

/**
 * Handles browser launch and token exchange for Google OAuth.
 */
async function executeBrowserOAuthFlow(
  db: DatabaseSync,
  credentials: GoogleOAuthCredentials,
  pkce: ReturnType<typeof generatePkceCodes>,
): Promise<{ success: boolean; email: string }> {
  const http = await import('node:http');

  return new Promise((resolve, reject) => {
    let server: InstanceType<typeof http.Server> | null = null;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (server) {
        server.close();
        server = null;
      }
    };

    server = http.createServer(async (req, res) => {
      try {
        if (!req.url || !req.url.startsWith('/oauth2callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const reqUrl = new URL(req.url, 'http://127.0.0.1');
        const error = reqUrl.searchParams.get('error');
        const state = reqUrl.searchParams.get('state');
        const code = reqUrl.searchParams.get('code');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!doctype html><html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
              <h2 style="color: #dc2626;">Google Authentication Cancelled</h2>
              <p>${encodeURIComponent(error)}</p>
              <p>You can close this window and return to Katia Invoices.</p>
            </body></html>
          `);
          cleanup();
          reject(new Error(`Google authorization was cancelled: ${error}`));
          return;
        }

        if (state !== pkce.state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('Invalid security state.');
          cleanup();
          reject(
            new Error('OAuth state mismatch. Security verification failed.'),
          );
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code');
          cleanup();
          reject(new Error('Missing authorization code in OAuth callback.'));
          return;
        }

        const addr = server?.address();
        const port = addr && typeof addr !== 'string' ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

        // Exchange code for tokens
        const tokenResult = await exchangeCodeForTokens({
          code,
          codeVerifier: pkce.codeVerifier,
          redirectUri,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
        });

        // Fetch user email
        const email = await fetchAuthenticatedUserEmail(
          tokenResult.accessToken,
          tokenResult.idToken,
        );

        // Store encrypted tokens in SQLite
        const storedTokens: StoredGmailTokens = {
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          expiryDate: tokenResult.expiryDate,
          email,
          scope: tokenResult.scope,
        };

        saveStoredGmailTokens(storedTokens, db);

        // Send a friendly success response
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!doctype html>
          <html>
            <head><title>Gmail Connected · Katia Invoices</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh; background: #f8fafc; color: #0f172a;">
              <div style="background: white; padding: 40px 32px; border-radius: 20px; border: 1px solid #e2e8f0; max-width: 480px; text-align: center; box-shadow: 0 12px 30px rgba(0,0,0,0.06);">
                <div style="width: 56px; height: 56px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px;">✓</div>
                <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 800;">Gmail Successfully Connected!</h2>
                <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">Authenticated as <strong>${email}</strong>.</p>
                <div style="padding: 12px; background: #f1f5f9; border-radius: 10px; font-size: 13px; font-weight: 600; color: #475569;">You can safely close this browser window and return to Katia Invoices.</div>
              </div>
            </body>
          </html>
        `);

        cleanup();
        resolve({ success: true, email });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address();
      const port = addr && typeof addr !== 'string' ? addr.port : 0;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const authUrl = getAuthorizationUrl(
        credentials.clientId,
        redirectUri,
        pkce,
      );

      // Open in default system browser
      void shell.openExternal(authUrl);

      timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            'Google authentication timed out. Please try connecting again.',
          ),
        );
      }, 180000); // 3 minutes timeout
    });

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * Disconnects the Gmail integration by revoking tokens with Google and clearing storage.
 */
export async function disconnectGmailAccount(
  db: DatabaseSync,
): Promise<{ success: boolean }> {
  const stored = loadStoredGmailTokens(db);

  if (stored) {
    if (stored.refreshToken) {
      await revokeGoogleToken(stored.refreshToken);
    } else if (stored.accessToken) {
      await revokeGoogleToken(stored.accessToken);
    }
  }

  clearStoredGmailTokens(db);
  return { success: true };
}

/**
 * Retrieves a valid, unexpired access token, automatically refreshing if needed.
 */
export async function getValidAccessToken(db: DatabaseSync): Promise<{
  accessToken: string;
  senderEmail: string;
}> {
  const stored = loadStoredGmailTokens(db);

  if (!stored) {
    throw new Error(
      'Gmail is not connected. Please connect your Gmail account in Settings before sending.',
    );
  }

  // If token has at least 5 minutes of validity remaining, return it
  if (stored.expiryDate - Date.now() > 300000) {
    return {
      accessToken: stored.accessToken,
      senderEmail: stored.email,
    };
  }

  // Token is expired or expiring soon; refresh it
  if (!stored.refreshToken) {
    throw new Error(
      'Gmail session expired and no refresh token is available. Please reconnect in Settings.',
    );
  }

  const credentials = getGoogleOAuthCredentials(db);
  if (!credentials) {
    throw new Error(
      'OAuth Client configuration missing. Please check your Settings.',
    );
  }

  try {
    const refreshed = await refreshGoogleAccessToken({
      refreshToken: stored.refreshToken,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });

    stored.accessToken = refreshed.accessToken;
    stored.expiryDate = refreshed.expiryDate;
    saveStoredGmailTokens(stored, db);

    return {
      accessToken: stored.accessToken,
      senderEmail: stored.email,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('invalid_grant')) {
      clearStoredGmailTokens(db);
      throw new Error(
        'Gmail authorization was revoked or expired. Please reconnect your account in Settings.',
      );
    }
    throw new Error(`Failed to refresh Gmail access token: ${message}`);
  }
}

/**
 * Sends an email using the Gmail REST API (users.messages.send) with RFC 2822 MIME payload.
 */
export async function sendEmailViaGmailApi(
  options: SendGmailOptions,
  db: DatabaseSync,
): Promise<GmailSendResult> {
  // Input validation
  if (!options.toEmail || !isValidEmail(options.toEmail)) {
    throw new Error(
      `Invalid recipient email address: "${options.toEmail}". Please provide a valid email.`,
    );
  }

  if (!options.subject || !options.subject.trim()) {
    throw new Error('Email subject is required.');
  }

  if (!options.htmlBody || !options.htmlBody.trim()) {
    throw new Error('Email message body is required.');
  }

  // Attachment size check
  if (options.attachments && options.attachments.length > 0) {
    const totalBytes = options.attachments.reduce(
      (sum, att) => sum + att.data.length,
      0,
    );
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      const mb = (totalBytes / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Total attachment size (${mb} MB) exceeds Gmail's 25 MB limit.`,
      );
    }
  }

  // Obtain active access token & sender email
  const { accessToken, senderEmail } = await getValidAccessToken(db);

  // Construct MIME message
  const rawMime = buildGmailMimeMessage({
    fromEmail: senderEmail,
    fromName: options.senderName,
    toEmail: options.toEmail.trim(),
    toName: options.toName,
    subject: options.subject.trim(),
    textBody: options.textBody,
    htmlBody: options.htmlBody,
    attachments: options.attachments,
  });

  // Base64URL encode the entire RFC 2822 message as required by Gmail API
  const base64UrlMessage = base64UrlEncode(rawMime);

  // Call Gmail REST API
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64UrlMessage }),
    },
  );

  const data = (await response.json()) as {
    id?: string;
    threadId?: string;
    error?: {
      code?: number;
      message?: string;
      status?: string;
      errors?: Array<{ message: string; reason: string }>;
    };
  };

  if (!response.ok || !data.id) {
    const errCode = data.error?.code || response.status;
    const errMsg = data.error?.message || 'Unknown Gmail API error';

    if (errCode === 401) {
      throw new Error(
        'Gmail authentication failed (401). Your authorization may have expired. Please reconnect in Settings.',
      );
    }

    if (errCode === 403) {
      throw new Error(
        `Gmail API permission or quota error (403): ${errMsg}. Check that your Google Cloud project has the Gmail API enabled.`,
      );
    }

    if (errCode === 400) {
      throw new Error(`Gmail API rejected the message (400): ${errMsg}`);
    }

    throw new Error(`Gmail delivery failed (${errCode}): ${errMsg}`);
  }

  return {
    success: true,
    messageId: data.id,
    threadId: data.threadId,
    senderEmail,
  };
}
