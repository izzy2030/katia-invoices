import crypto from 'node:crypto';
import http from 'node:http';
import { safeStorage } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { base64UrlEncode } from './gmailMime';

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface StoredGmailTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate: number; // Unix timestamp in ms
  email: string;
  scope?: string;
}

export interface PkceCodes {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const OAUTH_SCOPES = `${GMAIL_SEND_SCOPE} ${USERINFO_EMAIL_SCOPE} openid email`;

/**
 * Generates a high-entropy PKCE code_verifier, code_challenge (S256), and CSRF state token.
 */
export function generatePkceCodes(): PkceCodes {
  // 64 random bytes base64url encoded produces 86 URL-safe characters (valid range: 43 - 128)
  const codeVerifier = base64UrlEncode(crypto.randomBytes(64));
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64UrlEncode(hash);
  const state = crypto.randomBytes(24).toString('hex');

  return { codeVerifier, codeChallenge, state };
}

/**
 * Generates the Google OAuth 2.0 authorization URL for a desktop app with PKCE.
 */
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  pkce: PkceCodes,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    state: pkce.state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Starts a transient loopback HTTP server on 127.0.0.1 (random open port) to capture
 * the Google OAuth redirect callback.
 */
export function startLoopbackServer(
  expectedState: string,
  timeoutMs = 180000,
): Promise<{
  code: string;
  redirectUri: string;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    let server: http.Server | null = null;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (server) {
        server.close();
        server = null;
      }
    };

    server = http.createServer((req, res) => {
      try {
        if (!req.url || !req.url.startsWith('/oauth2callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const reqUrl = new URL(req.url, `http://127.0.0.1`);
        const error = reqUrl.searchParams.get('error');
        const state = reqUrl.searchParams.get('state');
        const code = reqUrl.searchParams.get('code');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!doctype html>
            <html>
              <head><title>Authentication Cancelled</title></head>
              <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh; background: #f8fafc; color: #1e293b;">
                <div style="background: white; padding: 40px; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 460px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                  <div style="font-size: 40px; margin-bottom: 16px;">✕</div>
                  <h2 style="margin: 0 0 10px; color: #dc2626;">Google Authorization Cancelled</h2>
                  <p style="color: #64748b; font-size: 14px; line-height: 1.5;">${encodeURIComponent(error)}</p>
                  <p style="margin-top: 24px; font-size: 13px; color: #94a3b8;">You can close this tab and return to Katia Invoices.</p>
                </div>
              </body>
            </html>
          `);
          cleanup();
          reject(new Error(`Google authorization was rejected: ${error}`));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!doctype html>
            <html>
              <head><title>Invalid State</title></head>
              <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh; background: #f8fafc; color: #1e293b;">
                <div style="background: white; padding: 40px; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 460px; text-align: center;">
                  <h2 style="color: #dc2626;">Security Validation Failed</h2>
                  <p style="color: #64748b; font-size: 14px;">OAuth state token mismatch. Possible CSRF attempt.</p>
                </div>
              </body>
            </html>
          `);
          cleanup();
          reject(
            new Error('OAuth state mismatch. Security verification failed.'),
          );
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing authorization code.');
          cleanup();
          reject(new Error('Missing authorization code in OAuth callback.'));
          return;
        }

        // Send a friendly success response to the browser
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!doctype html>
          <html>
            <head><title>Gmail Connected · Katia Invoices</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh; background: #f8fafc; color: #0f172a;">
              <div style="background: white; padding: 40px 32px; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 480px; text-align: center; box-shadow: 0 12px 30px rgba(0,0,0,0.06);">
                <div style="width: 56px; height: 56px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px;">✓</div>
                <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 800;">Gmail Successfully Connected!</h2>
                <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0 0 24px;">Your Google account is now linked to Katia Invoices. You can now send official estimates and invoices directly through your Gmail account.</p>
                <div style="padding: 12px; background: #f1f5f9; border-radius: 8px; font-size: 13px; font-weight: 600; color: #475569;">You can safely close this browser window and return to the application.</div>
              </div>
            </body>
          </html>
        `);

        const addr = server?.address();
        const port = addr && typeof addr !== 'string' ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

        cleanup();
        resolve({
          code,
          redirectUri,
          close: cleanup,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            'Gmail authorization timed out. Please try connecting again.',
          ),
        );
      }, timeoutMs);
    });

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * Exchanges the authorization code and PKCE code_verifier for Google OAuth tokens.
 */
export async function exchangeCodeForTokens(options: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiryDate: number;
  scope?: string;
  idToken?: string;
}> {
  const bodyParams = new URLSearchParams({
    code: options.code,
    client_id: options.clientId,
    code_verifier: options.codeVerifier,
    redirect_uri: options.redirectUri,
    grant_type: 'authorization_code',
  });

  if (options.clientSecret) {
    bodyParams.append('client_secret', options.clientSecret);
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    const errorMsg =
      data.error_description ||
      data.error ||
      `Token exchange failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  const expiresInSec = data.expires_in ?? 3600;
  const expiryDate = Date.now() + expiresInSec * 1000;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate,
    scope: data.scope,
    idToken: data.id_token,
  };
}

/**
 * Refreshes an expired access token using the stored refresh_token.
 */
export async function refreshGoogleAccessToken(options: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{
  accessToken: string;
  expiryDate: number;
  scope?: string;
}> {
  const bodyParams = new URLSearchParams({
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    grant_type: 'refresh_token',
  });

  if (options.clientSecret) {
    bodyParams.append('client_secret', options.clientSecret);
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    const errorMsg =
      data.error_description ||
      data.error ||
      `Token refresh failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  const expiresInSec = data.expires_in ?? 3600;
  const expiryDate = Date.now() + expiresInSec * 1000;

  return {
    accessToken: data.access_token,
    expiryDate,
    scope: data.scope,
  };
}

/**
 * Fetches the authenticated user's email address using either the ID Token JWT payload
 * or Google's UserInfo API endpoint.
 */
export async function fetchAuthenticatedUserEmail(
  accessToken: string,
  idToken?: string,
): Promise<string> {
  // Try extracting email directly from the ID token if present
  if (idToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf8'),
        ) as { email?: string };
        if (payload.email) return payload.email.trim();
      }
    } catch {
      // Fallback to UserInfo API
    }
  }

  // Fallback to UserInfo API
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.ok) {
    const data = (await response.json()) as { email?: string };
    if (data.email) return data.email.trim();
  }

  // Secondary fallback: tokeninfo
  const tokenInfoRes = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (tokenInfoRes.ok) {
    const data = (await tokenInfoRes.json()) as { email?: string };
    if (data.email) return data.email.trim();
  }

  throw new Error(
    'Could not retrieve authenticated user email address from Google.',
  );
}

/**
 * Revokes an access or refresh token with Google.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `token=${encodeURIComponent(token)}`,
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// OS-Backed Credential Storage using Electron safeStorage & SQLite
// ---------------------------------------------------------------------------

const GMAIL_TOKENS_SETTING_KEY = 'gmail_encrypted_tokens';
const GMAIL_CLIENT_ID_KEY = 'gmail_oauth_client_id';
const GMAIL_CLIENT_SECRET_KEY = 'gmail_oauth_client_secret';
const GMAIL_CONNECTED_EMAIL_KEY = 'gmail_connected_email';

/**
 * Securely encrypts and saves OAuth tokens to SQLite using Electron's OS-backed safeStorage.
 */
export function saveStoredGmailTokens(
  tokens: StoredGmailTokens,
  db: DatabaseSync,
): void {
  const json = JSON.stringify(tokens);
  let storedValue: string;

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    storedValue = `dpapi:${encrypted.toString('base64')}`;
  } else {
    // Fallback for environments where DPAPI/keyring is unavailable (e.g. CI headless)
    storedValue = `plain:${Buffer.from(json, 'utf8').toString('base64')}`;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(GMAIL_TOKENS_SETTING_KEY, storedValue);

    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(GMAIL_CONNECTED_EMAIL_KEY, tokens.email);

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

/**
 * Reads and decrypts stored OAuth tokens from SQLite using Electron's safeStorage.
 */
export function loadStoredGmailTokens(
  db: DatabaseSync,
): StoredGmailTokens | null {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(GMAIL_TOKENS_SETTING_KEY) as { value: string } | undefined;

  if (!row || !row.value) return null;

  try {
    let json: string;
    if (row.value.startsWith('dpapi:')) {
      const base64Data = row.value.slice(6);
      const encryptedBuffer = Buffer.from(base64Data, 'base64');
      json = safeStorage.decryptString(encryptedBuffer);
    } else if (row.value.startsWith('plain:')) {
      const base64Data = row.value.slice(6);
      json = Buffer.from(base64Data, 'base64').toString('utf8');
    } else {
      json = row.value;
    }

    return JSON.parse(json) as StoredGmailTokens;
  } catch (error) {
    console.error('Failed to decrypt stored Gmail tokens:', error);
    return null;
  }
}

/**
 * Clears stored Gmail credentials and connected email from the database.
 */
export function clearStoredGmailTokens(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare('DELETE FROM app_settings WHERE key IN (?, ?)').run(
      GMAIL_TOKENS_SETTING_KEY,
      GMAIL_CONNECTED_EMAIL_KEY,
    );
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

/**
 * Gets the configured Google OAuth Client ID and Client Secret, checking:
 * 1. Environment variables (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET)
 * 2. SQLite app_settings
 */
export function getGoogleOAuthCredentials(
  db: DatabaseSync,
): GoogleOAuthCredentials | null {
  const envClientId = process.env.GMAIL_CLIENT_ID?.trim();
  const envClientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();

  if (envClientId) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret || '',
    };
  }

  const idRow = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(GMAIL_CLIENT_ID_KEY) as { value: string } | undefined;

  const secretRow = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(GMAIL_CLIENT_SECRET_KEY) as { value: string } | undefined;

  const clientId = idRow?.value?.trim();
  const clientSecret = secretRow?.value?.trim() || '';

  if (clientId) {
    return { clientId, clientSecret };
  }

  return null;
}

/**
 * Saves Google OAuth client credentials in SQLite app_settings.
 */
export function saveGoogleOAuthCredentials(
  credentials: GoogleOAuthCredentials,
  db: DatabaseSync,
): void {
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(GMAIL_CLIENT_ID_KEY, credentials.clientId.trim());

    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(GMAIL_CLIENT_SECRET_KEY, credentials.clientSecret.trim());

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}
