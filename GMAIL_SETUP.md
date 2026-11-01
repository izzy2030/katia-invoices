# Official Gmail API & OAuth 2.0 Integration Setup

This guide walks through configuring Google Cloud to enable official Gmail API delivery for **Katia Invoices & Receipts**. Users can send invoices and receipts directly from their own authorized Google/Gmail accounts with generated PDF documents attached.

---

## 1. Google Cloud Project Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown in the top navigation bar and select **New Project**.
3. Name your project (e.g., `Katia Invoices Desktop`) and select your Organization/Location if applicable.
4. Click **Create** and wait for the project to provision.

---

## 2. Enable the Gmail API

1. In the Google Cloud Console, navigate to **APIs & Services** > **Library** (or search for **Gmail API**).
2. Select **Gmail API** from Google Enterprise APIs.
3. Click **Enable**.

---

## 3. Configure the OAuth Consent Screen

1. In the left navigation, click **APIs & Services** > **OAuth consent screen**.
2. **User Type**:
   - Choose **External** (unless you are using Google Workspace organization accounts exclusively).
   - Click **Create**.
3. **App Information**:
   - **App name**: `Katia Invoices & Receipts`
   - **User support email**: Select your email address.
   - **Developer contact information**: Enter your contact email.
   - Click **Save and Continue**.
4. **Scopes**:
   - Click **Add or Remove Scopes**.
   - Filter and select the minimum required scope:
     - `https://www.googleapis.com/auth/gmail.send` (Send email on your behalf)
     - `https://www.googleapis.com/auth/userinfo.email` / `email` (View your email address)
     - `openid`
   > [!IMPORTANT]
   > Do **NOT** request `gmail.readonly`, `gmail.modify`, or full mailbox access. This application adheres to the principle of least privilege: zero permissions to read, search, or delete existing emails.
   - Click **Update** and then **Save and Continue**.
5. **Test Users** (Development & Internal Testing):
   - While the app is in "Testing" publishing status, add the Gmail addresses of the users who will be authenticating (e.g. `your-shop@gmail.com`).
   - Click **Save and Continue**.

---

## 4. Create Desktop OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. **Application type**: Select **Desktop app** (or **Desktop application**).
4. **Name**: `Katia Invoices Desktop Client`.
5. Click **Create**.
6. A dialog will show your **Client ID** and **Client Secret**.
   - Copy the **Client ID** (e.g. `1234567890-abcdef.apps.googleusercontent.com`).
   - Copy the **Client Secret** (e.g. `GOCSPX-xxxxxxxxxxxxxxxx`).

> [!NOTE]
> Google desktop applications utilize transient loopback HTTP redirection (`http://127.0.0.1:<port>/oauth2callback`) with PKCE (Proof Key for Code Exchange). Loopback redirect URIs on `127.0.0.1` are automatically authorized by Google for Desktop clients without needing static port registration.

---

## 5. Entering Credentials into Katia Invoices

There are two convenient methods to supply the OAuth Client credentials:

### Method A: Via the Settings UI (Recommended)

1. Open **Katia Invoices**.
2. Click the **Settings** icon in the sidebar.
3. In the **Gmail Integration (Official OAuth 2.0)** card:
   - Click **▼ Configure** under **Google Cloud OAuth Client Credentials**.
   - Paste your **OAuth 2.0 Client ID**.
   - Paste your **OAuth 2.0 Client Secret** (optional for PKCE).
   - Click **Save Client Credentials**.
4. Click **Connect Gmail with Google**.
5. Your default system browser will open the standard Google Consent screen. Select your account and grant `Send email` permission.
6. The browser will redirect to the local loopback receiver, displaying **Gmail Successfully Connected!**.
7. Return to the app: your connected Gmail address will appear with an active green status pill.

### Method B: Via Environment Variables (Developers)

You can configure environment variables in your launch environment or `.env`:

```env
GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="GOCSPX-your-client-secret"
```

When present, environment variables automatically take precedence.

---

## 6. How OAuth 2.0 + PKCE Works in Katia Invoices

```
+------------------+         1. Generates PKCE Verifier & S256 Challenge
| Katia Invoices   |         2. Binds ephemeral loopback server (127.0.0.1:port)
| Desktop (Node)   |         3. Opens system browser: accounts.google.com
+--------+---------+
         |
         | 4. User signs in & confirms consent
         v
+------------------+
| Google OAuth 2.0 |
+--------+---------+
         |
         | 5. Redirects to http://127.0.0.1:port/oauth2callback?code=...&state=...
         v
+------------------+
| Loopback Server  |  6. Verifies CSRF state token
| (Main Process)   |  7. Exchanges code + PKCE verifier for Tokens
+--------+---------+  8. Resolves authenticated sender email
         |
         | 9. Tokens encrypted via Windows DPAPI (safeStorage)
         v
+------------------+
| SQLite Storage   |  10. Stored in app_settings table as dpapi:<base64>
+------------------+
```

### Security Highlights

- **OS-Backed DPAPI Encryption**: Access and refresh tokens are encrypted using Electron's `safeStorage` (backed by Windows Data Protection API) before being stored in SQLite. Tokens are never stored in plain text.
- **Renderer Isolation**: No OAuth secrets, client secrets, access tokens, or refresh tokens are ever exposed to the Chromium renderer process.
- **CSRF State Verification**: Every authorization request uses a 48-character cryptographically random state parameter verified prior to token exchange.
- **Explicit User Confirmation**: No emails are sent automatically; each send action opens an email composition modal allowing inspection of recipient, subject, personal note, and PDF attachment with user confirmation.

---

## 7. Testing & Verification

Run the test suite to verify MIME construction, RFC 2047 Unicode encoding, PKCE generation, and error handling:

```bash
# Typecheck TypeScript files
npm run typecheck

# Run customer and history tests
node src/customerHistory.test.cjs

# Run Gmail integration tests
node src/gmailIntegration.test.cjs

# Run build verification
npm run build
```

---

## 8. Verification Requirements for Public Distribution

If distributing the desktop application publicly to external customers outside of your test user list:

1. Complete Google's **OAuth App Verification** in the Google Cloud Console.
2. Submit a privacy policy link and YouTube demonstration video showing the desktop app sending an invoice via the Gmail API.
3. Because this app only requests `gmail.send` and zero read scopes, the verification process does not require a Tier 2 Cloud Security Assessment (CASA).
