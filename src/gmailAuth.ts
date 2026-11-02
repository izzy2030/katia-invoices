import crypto from 'node:crypto';
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
