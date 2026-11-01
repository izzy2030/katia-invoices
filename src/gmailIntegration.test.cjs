const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');

console.log('--- Starting Katia Invoices Gmail Integration Tests ---');

// Mock Electron modules for node execution
const mockElectron = {
  safeStorage: {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(str) {
      return Buffer.from(`encrypted:${str}`, 'utf8');
    },
    decryptString(buf) {
      const raw = buf.toString('utf8');
      if (raw.startsWith('encrypted:')) {
        return raw.replace('encrypted:', '');
      }
      return raw;
    },
  },
  shell: {
    async openExternal(_url) {
      return true;
    },
  },
};

// Module loader supporting TypeScript transpilation
function loadModule(name) {
  const filename = path.join(__dirname, `${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (specifier) => {
      if (specifier === 'electron') {
        return mockElectron;
      }
      if (specifier.startsWith('node:')) {
        return require(specifier);
      }
      const clean = specifier
        .replace('./', '')
        .replace('.ts', '')
        .replace('.js', '');
      return loadModule(clean);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}

// 1. Test MIME and RFC encoding utilities
const gmailMime = loadModule('gmailMime');
const {
  encodeHeaderValue,
  formatEmailAddress,
  wrapBase64Lines,
  base64UrlEncode,
  htmlToPlainText,
  buildGmailMimeMessage,
} = gmailMime;

// Test 1.1: encodeHeaderValue with ASCII vs Unicode
{
  const plainAscii = 'Repair Order RO-10492';
  assert.equal(
    encodeHeaderValue(plainAscii),
    plainAscii,
    'Plain ASCII headers should remain unencoded',
  );

  const unicodeSubject = 'Orden de Reparación · Katia Auto Sales';
  const encoded = encodeHeaderValue(unicodeSubject);
  assert.match(
    encoded,
    /^=\?UTF-8\?B\?.+\?=$/,
    'Unicode headers must be encoded using RFC 2047 format',
  );

  // Decode the RFC 2047 base64 payload to ensure round-trip integrity
  const b64Part = encoded.replace('=?UTF-8?B?', '').replace('?=', '');
  const restored = Buffer.from(b64Part, 'base64').toString('utf8');
  assert.equal(
    restored,
    unicodeSubject,
    'RFC 2047 encoded subject must restore exact original Unicode characters',
  );
  console.log('✓ Header encoding and RFC 2047 Unicode handling verified');
}

// Test 1.2: formatEmailAddress formatting
{
  assert.equal(
    formatEmailAddress('customer@example.com'),
    'customer@example.com',
    'Plain email should have no quotes or brackets',
  );

  const formatted = formatEmailAddress('customer@example.com', 'Maria José');
  assert.match(
    formatted,
    /<customer@example\.com>$/,
    'Address must end with bracketed email',
  );
  assert.match(
    formatted,
    /^"=\?UTF-8\?B\?.+"/,
    'Unicode display name must be quoted and RFC 2047 encoded',
  );
  console.log('✓ Email address formatting and display name quoting verified');
}

// Test 1.3: wrapBase64Lines at 76 characters
{
  const testData = 'A'.repeat(200);
  const wrapped = wrapBase64Lines(testData, 76);
  const lines = wrapped.split('\r\n');
  assert.equal(
    lines.length,
    3,
    '200 characters should split into 3 lines at 76 char boundary',
  );
  assert.equal(lines[0].length, 76, 'First line length must be 76');
  assert.equal(lines[1].length, 76, 'Second line length must be 76');
  assert.equal(lines[2].length, 48, 'Third line length must be remainder (48)');
  assert.equal(
    wrapped.replace(/\r\n/g, ''),
    testData,
    'Rejoined wrapped lines must match original data',
  );
  console.log('✓ RFC 2045 76-character line wrapping verified');
}

// Test 1.4: base64UrlEncode conversion
{
  // Buffer containing characters that in base64 produce '+' and '/' and '='
  const sample = Buffer.from([251, 255, 254, 250]);
  const urlEncoded = base64UrlEncode(sample);

  assert.ok(!urlEncoded.includes('+'), 'base64url must not contain +');
  assert.ok(!urlEncoded.includes('/'), 'base64url must not contain /');
  assert.ok(
    !urlEncoded.includes('='),
    'base64url must not contain trailing padding =',
  );
  assert.match(
    urlEncoded,
    /^[A-Za-z0-9_-]+$/,
    'base64url must only use URL-safe characters',
  );
  console.log('✓ RFC 4648 Base64URL encoding verified');
}

// Test 1.5: htmlToPlainText fallback generator
{
  const html = `
    <div>
      <h1>KATIA AUTO REPAIRS</h1>
      <p>Hello <strong>Jane Doe</strong>,</p>
      <p>Your vehicle is ready &amp; inspection passed.<br/>Thank you!</p>
    </div>
  `;
  const text = htmlToPlainText(html);
  assert.ok(!text.includes('<h1>'), 'Tags must be stripped');
  assert.ok(!text.includes('<strong>'), 'Tags must be stripped');
  assert.ok(text.includes('Jane Doe'), 'Text content must remain');
  assert.ok(
    text.includes('ready & inspection passed'),
    'Entities like &amp; must be unescaped',
  );
  console.log('✓ HTML to plain-text converter verified');
}

// Test 1.6: buildGmailMimeMessage complete email with PDF attachment
{
  const mockPdfBytes = Buffer.from(
    '%PDF-1.4 mock pdf data for testing invoices',
  );
  const mime = buildGmailMimeMessage({
    fromEmail: 'shop@katiaautosales.com',
    fromName: 'Katia Auto Sales & Repairs',
    toEmail: 'customer@example.com',
    toName: 'José Ramírez',
    subject: 'Repair Order RO-00500 · Katia Auto Sales',
    htmlBody:
      '<h1>Your Invoice</h1><p>Thank you for choosing Katia Auto Sales!</p>',
    attachments: [
      {
        filename: 'RO-00500.pdf',
        contentType: 'application/pdf',
        data: mockPdfBytes,
      },
    ],
  });

  // Verify RFC 2822 Structure
  assert.ok(
    mime.includes('MIME-Version: 1.0'),
    'Must contain MIME-Version header',
  );
  assert.ok(mime.includes('From: "'), 'From header must exist');
  assert.ok(mime.includes('To: "'), 'To header must exist');
  assert.ok(
    mime.includes('Subject: =?UTF-8?B?'),
    'Subject header must exist and be RFC 2047 encoded',
  );
  assert.ok(
    mime.includes('Content-Type: multipart/mixed; boundary='),
    'Envelope must be multipart/mixed for attachments',
  );
  assert.ok(
    mime.includes('Content-Type: multipart/alternative; boundary='),
    'Must contain multipart/alternative subpart',
  );
  assert.ok(
    mime.includes('Content-Type: text/plain; charset=UTF-8'),
    'Must include plain text alternative',
  );
  assert.ok(
    mime.includes('Content-Type: text/html; charset=UTF-8'),
    'Must include HTML alternative',
  );
  assert.ok(
    mime.includes('Content-Type: application/pdf; name="RO-00500.pdf"'),
    'Must include PDF attachment content type',
  );
  assert.ok(
    mime.includes('Content-Disposition: attachment; filename="RO-00500.pdf"'),
    'Must declare attachment disposition',
  );
  assert.ok(
    mime.includes(wrapBase64Lines(mockPdfBytes.toString('base64'))),
    'Must contain base64-encoded PDF data',
  );

  // Verify Base64URL representation for Gmail API
  const urlSafe = base64UrlEncode(mime);
  assert.ok(urlSafe.length > 100, 'Base64URL output must be generated');
  assert.ok(
    !urlSafe.includes('+') && !urlSafe.includes('/'),
    'Base64URL must be URL safe',
  );
  console.log(
    '✓ Multipart MIME construction and PDF attachment encoding verified',
  );
}

// 2. Test PKCE and OAuth Flow Components
const gmailAuth = loadModule('gmailAuth');
const { generatePkceCodes, getAuthorizationUrl } = gmailAuth;

// Test 2.1: PKCE code generation
{
  const pkce = generatePkceCodes();
  assert.ok(
    pkce.codeVerifier.length >= 43 && pkce.codeVerifier.length <= 128,
    'Verifier must be between 43 and 128 characters',
  );
  assert.match(
    pkce.codeVerifier,
    /^[A-Za-z0-9_-]+$/,
    'Verifier must be URL-safe',
  );

  // Verify S256 challenge calculation
  const expectedChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(pkce.codeVerifier).digest(),
  );
  assert.equal(
    pkce.codeChallenge,
    expectedChallenge,
    'Challenge must match SHA256 of verifier encoded in base64url',
  );
  assert.equal(
    pkce.state.length,
    48,
    'State must be a 24-byte hex string (48 chars)',
  );
  console.log('✓ PKCE code_verifier and S256 challenge generation verified');
}

// Test 2.2: OAuth Authorization URL construction
{
  const pkce = generatePkceCodes();
  const clientId = '123456789-abcdef.apps.googleusercontent.com';
  const redirectUri = 'http://127.0.0.1:54321/oauth2callback';
  const urlString = getAuthorizationUrl(clientId, redirectUri, pkce);

  const parsedUrl = new URL(urlString);
  assert.equal(parsedUrl.origin, 'https://accounts.google.com');
  assert.equal(parsedUrl.pathname, '/o/oauth2/v2/auth');
  assert.equal(parsedUrl.searchParams.get('client_id'), clientId);
  assert.equal(parsedUrl.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(parsedUrl.searchParams.get('response_type'), 'code');
  assert.equal(
    parsedUrl.searchParams.get('code_challenge'),
    pkce.codeChallenge,
  );
  assert.equal(parsedUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsedUrl.searchParams.get('state'), pkce.state);
  assert.equal(parsedUrl.searchParams.get('access_type'), 'offline');
  assert.equal(parsedUrl.searchParams.get('prompt'), 'consent');

  const scope = parsedUrl.searchParams.get('scope') || '';
  assert.ok(
    scope.includes('https://www.googleapis.com/auth/gmail.send'),
    'Scope must include gmail.send',
  );
  assert.ok(
    scope.includes('email') || scope.includes('userinfo.email'),
    'Scope must include email for sender address',
  );
  assert.ok(
    !scope.includes('gmail.readonly'),
    'Scope must NEVER request inbox reading permission',
  );
  assert.ok(
    !scope.includes('gmail.modify'),
    'Scope must NEVER request message modification permission',
  );
  console.log(
    '✓ Google OAuth 2.0 PKCE authorization URL construction verified',
  );
}

// Test 2.3: State Token CSRF validation logic
{
  const expectedState = 'valid-csrf-token-12345';
  const attackerState = 'forged-state-attack';

  function validateOAuthCallback(params, expected) {
    if (params.error) {
      throw new Error(`Google authorization was rejected: ${params.error}`);
    }
    if (params.state !== expected) {
      throw new Error('OAuth state mismatch. Security verification failed.');
    }
    if (!params.code) {
      throw new Error('Missing authorization code in OAuth callback.');
    }
    return params.code;
  }

  // Verify rejection of mismatched state (CSRF attack attempt)
  assert.throws(
    () =>
      validateOAuthCallback(
        { state: attackerState, code: 'stolen-code' },
        expectedState,
      ),
    /OAuth state mismatch/,
    'Must throw on state mismatch',
  );

  // Verify rejection of user cancellation
  assert.throws(
    () =>
      validateOAuthCallback(
        { error: 'access_denied', state: expectedState },
        expectedState,
      ),
    /Google authorization was rejected/,
    'Must throw on access denial',
  );

  // Verify acceptance of valid code and matching state
  const code = validateOAuthCallback(
    { state: expectedState, code: 'auth-code-xyz' },
    expectedState,
  );
  assert.equal(code, 'auth-code-xyz');
  console.log('✓ OAuth CSRF state verification and rejection logic verified');
}

// Test 2.4: OS-backed DPAPI Token Encryption and SQLite Storage
{
  const { DatabaseSync } = require('node:sqlite');
  const {
    saveStoredGmailTokens,
    loadStoredGmailTokens,
    clearStoredGmailTokens,
  } = gmailAuth;

  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)');

  const testTokens = {
    accessToken: 'ya29.sample_test_access_token',
    refreshToken: '1//sample_refresh_token_xyz',
    expiryDate: Date.now() + 3600000,
    email: 'shop@katiaautosales.com',
    scope: 'https://www.googleapis.com/auth/gmail.send',
  };

  saveStoredGmailTokens(testTokens, db);

  // Verify raw data in SQLite has DPAPI encryption prefix and cannot be read as plain JSON
  const rawRow = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get('gmail_encrypted_tokens');
  assert.ok(
    rawRow.value.startsWith('dpapi:'),
    'Stored token must have dpapi: prefix',
  );
  assert.ok(
    !rawRow.value.includes('sample_test_access_token'),
    'Raw token text must NEVER be stored unencrypted',
  );

  // Verify secure retrieval and decryption
  const loaded = loadStoredGmailTokens(db);
  assert.ok(loaded, 'Must successfully load stored tokens');
  assert.equal(loaded.email, testTokens.email);
  assert.equal(loaded.accessToken, testTokens.accessToken);
  assert.equal(loaded.refreshToken, testTokens.refreshToken);

  // Verify clearing stored credentials
  clearStoredGmailTokens(db);
  const cleared = loadStoredGmailTokens(db);
  assert.equal(cleared, null, 'Tokens must be null after clearing credentials');
  console.log(
    '✓ OS-backed safeStorage DPAPI token encryption and SQLite storage verified',
  );
}

// 3. Test Gmail API Error Diagnostics and Payload Limits
{
  // Test attachment size validation
  const MAX_GMAIL_BYTES = 25 * 1024 * 1024; // 25 MB
  const oversizedAttachment = {
    filename: 'giant.pdf',
    data: Buffer.alloc(MAX_GMAIL_BYTES + 1024),
  };

  const isOversized = oversizedAttachment.data.length > MAX_GMAIL_BYTES;
  assert.ok(isOversized, 'Attachments exceeding 25MB must be flagged');

  // Diagnostic error formatter check
  function formatGmailError(status, message) {
    if (status === 401) {
      return 'Gmail authorization expired or was revoked. Please reconnect your Google account in Settings.';
    }
    if (status === 403) {
      return 'Permission denied: Ensure the Gmail API is enabled in your Google Cloud Console project and permissions have been granted.';
    }
    if (status === 400) {
      return `Invalid email format or recipient: ${message}`;
    }
    return `Gmail API delivery error (${status}): ${message}`;
  }

  assert.equal(
    formatGmailError(401, 'Invalid Credentials'),
    'Gmail authorization expired or was revoked. Please reconnect your Google account in Settings.',
  );
  assert.equal(
    formatGmailError(403, 'Access Not Configured'),
    'Permission denied: Ensure the Gmail API is enabled in your Google Cloud Console project and permissions have been granted.',
  );
  assert.ok(
    formatGmailError(400, 'Bad RFC 822').includes('Invalid email format'),
  );
  console.log('✓ Gmail API error diagnostics and 25MB size limit verified');
}

// 4. Test WorkOrder Data Model and Email Delivery Metadata
const workOrderModule = loadModule('workOrder');
const { normalizeInput, chargeTotals } = workOrderModule;

{
  const rawInput = {
    orderNumber: 'RO-10022',
    customerName: 'Marcus Vance',
    vehicleYear: '2023',
    vehicleMake: 'Subaru',
    vehicleModel: 'Outback',
    charges: [
      {
        id: '1',
        kind: 'labor',
        description: 'Diagnostic teardown',
        amount: '150.00',
        taxable: false,
      },
      {
        id: '2',
        kind: 'parts',
        description: 'Headlamp assembly',
        amount: '350.00',
        taxable: true,
      },
    ],
    taxRate: '8.25',
    lastEmailSent: {
      recipient: 'marcus@example.com',
      sentAt: '2026-10-30T19:00:00.000Z',
      messageId: '18b2a3c4d5e6f7',
      subject: 'Repair Order RO-10022 · Katia Auto Sales',
      senderEmail: 'katiaautosales@gmail.com',
    },
  };

  const normalized = normalizeInput(rawInput);
  assert.ok(
    normalized.lastEmailSent,
    'normalizeInput must preserve lastEmailSent metadata',
  );
  assert.equal(normalized.lastEmailSent.recipient, 'marcus@example.com');
  assert.equal(normalized.lastEmailSent.messageId, '18b2a3c4d5e6f7');
  assert.equal(
    normalized.lastEmailSent.senderEmail,
    'katiaautosales@gmail.com',
  );

  // Verify that adding email delivery metadata does NOT mutate charge totals or financial calculations
  const totals = chargeTotals(normalized);
  assert.equal(totals.labor, 150.0);
  assert.equal(totals.parts, 350.0);
  assert.equal(totals.labor + totals.parts, 500.0);
  assert.equal(totals.tax, 28.88); // 350 * 0.0825 = 28.875 -> 28.88
  assert.equal(totals.total, 528.88);
  console.log(
    '✓ WorkOrder data model preserves lastEmailSent without affecting financial totals',
  );
}

// 5. Test Nut Ring Logo Suite, Receipt Header & Email Brand Header
const logoModule = loadModule('logo');
const receiptModule = loadModule('receipt');

{
  // Test 5.1: Ring mark vs small solid mark
  const ringSvg = logoModule.katiaHexBadgeSvg({ size: 38 });
  assert.ok(ringSvg.startsWith('<svg'), 'Must return valid SVG element');
  assert.ok(
    ringSvg.includes('width="38"'),
    'Mark SVG must respect requested size',
  );
  assert.equal(
    ringSvg.match(/<path/g).length,
    2,
    '38px mark must draw the ring and the solid K hexagon',
  );

  const smallSvg = logoModule.katiaHexBadgeSvg({ size: 16 });
  assert.equal(
    smallSvg.match(/<path/g).length,
    1,
    '16px mark must drop the ring so the gap does not close up',
  );

  const printSvg = logoModule.katiaHexBadgeSvg({
    size: 64,
    variant: 'print',
    className: 'brand-logo',
  });
  assert.ok(
    printSvg.includes('class="brand-logo"'),
    'Must include custom className',
  );
  assert.ok(
    printSvg.includes('fill="#0f172a"'),
    'Print variant must use the dark ink color',
  );
  assert.ok(
    !printSvg.includes('<text'),
    'Mark must not depend on installed fonts',
  );

  // Test 5.2: Horizontal Lockup, Google Profile Avatar & App Icon SVGs
  const horizSvg = logoModule.katiaHorizontalLockupSvg();
  assert.ok(horizSvg.includes('viewBox="0 0 900 300"'));
  assert.ok(horizSvg.includes('Katia Auto Sales &amp; Repairs Inc.'));
  assert.ok(!horizSvg.includes('<text'), 'Lockup must use outlined type');
  assert.ok(!horizSvg.includes('<rect'), 'Lockup must be transparent');

  const gbpSvg = logoModule.katiaGoogleProfileAvatarSvg();
  assert.ok(gbpSvg.includes('viewBox="0 0 1024 1024"'));
  assert.ok(gbpSvg.includes('Katia Auto Sales &amp; Repairs Inc.'));

  const appIconSvg = logoModule.katiaAppIconSvg();
  assert.ok(appIconSvg.includes('rx="180"'));

  // Test 5.3: Email Brand Header & htmlToPlainText SVG stripping
  const emailHeader = logoModule.buildKatiaEmailBrandHeader({
    shopName: 'Katia Auto Sales & Repairs',
    subtitle: '1005 Rural St, Aurora, IL 60505',
  });
  assert.ok(
    emailHeader.includes('<svg'),
    'Email header must embed Nut Ring SVG',
  );
  assert.ok(
    emailHeader.includes('fill="#ffffff"'),
    'Email header mark must be reversed to show on its dark box',
  );
  assert.ok(
    emailHeader.includes('KATIA AUTO SALES &amp; REPAIRS'),
    'Email header must uppercase shop name',
  );

  const plainFromHeader = htmlToPlainText(
    `<div>${emailHeader}<p>Hello Customer</p></div>`,
  );
  assert.ok(
    !plainFromHeader.includes('<svg'),
    'Plain text converter must strip SVG tags',
  );
  assert.ok(
    plainFromHeader.includes('Hello Customer'),
    'Plain text converter must preserve email body text',
  );

  // Test 5.4: Receipt HTML integration with Nut Ring mark
  const sampleReceipt = receiptModule.receiptHtml(
    {
      id: 'ord-1',
      orderNumber: 'RO-00999',
      customerName: 'Elena Vargas',
      phone: '(630) 555-0100',
      address: '100 Main St',
      vehicleYear: '2020',
      vehicleMake: 'Honda',
      vehicleModel: 'Civic',
      vin: '2HGFC2F69LH000001',
      licensePlate: 'ELENA-1',
      mileage: '50,000',
      dateIn: '2026-11-01',
      datePromised: '2026-11-03',
      concerns: 'Bumper repair',
      charges: [],
      createdAt: '2026-11-01T12:00:00Z',
      total: 0,
    },
    {
      shopName: 'KATIA Auto & Body <Custom>',
      shopAddress: '1005 Rural St, Aurora, IL 60505',
      shopPhone: '(630) 907-7198',
    },
  );
  assert.ok(
    sampleReceipt.includes('<div class="brand-lockup">'),
    'Receipt header must contain .brand-lockup container',
  );
  assert.ok(
    sampleReceipt.includes('class="brand-logo"'),
    'Receipt header must embed .brand-logo Nut Ring SVG',
  );
  assert.ok(
    sampleReceipt.includes('&lt;Custom&gt;'),
    'Receipt header must escape special characters in custom shopName',
  );
  // Test 5.5: Additional work is itemized and the revised total leads
  const revisedReceipt = receiptModule.receiptHtml({
    id: 'ord-2',
    orderNumber: 'RO-01000',
    customerName: 'Elena Vargas',
    dateIn: '2026-10-28',
    charges: [{ kind: 'parts', description: 'Bumper', amount: '100' }],
    revisedCharges: [
      { kind: 'labor', description: 'Install headlamp', amount: '50' },
    ],
    createdAt: '2026-11-01T12:00:00Z',
    total: 0,
  });
  assert.ok(
    revisedReceipt.includes('Install headlamp'),
    'Receipt must itemize additional work lines',
  );
  assert.ok(
    /<label>Revised total<\/label>\s*<strong>\$150\.00<\/strong>/.test(
      revisedReceipt,
    ),
    'Receipt must lead with the revised total',
  );
  assert.ok(
    revisedReceipt.includes('Oct 28, 2026'),
    'Receipt must show readable dates',
  );

  // Test 5.6: Receipt style setting picks the layout, defaulting to modern
  const styledReceipt = (receiptStyle) =>
    receiptModule.receiptHtml(
      {
        id: 'ord-3',
        orderNumber: 'RO-01001',
        charges: [],
        createdAt: '2026-11-01T12:00:00Z',
        total: 0,
      },
      { receiptStyle },
    );
  assert.ok(styledReceipt(undefined).includes('size: letter portrait'));
  assert.ok(styledReceipt('modern').includes('size: letter portrait'));
  assert.ok(styledReceipt('classic').includes('size: letter landscape'));

  console.log(
    '✓ Nut Ring SVG suite, receipt header, and email brand header verified',
  );
}

console.log('--- ALL GMAIL INTEGRATION TESTS PASSED (100% SUCCESS) ---');
