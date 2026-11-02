const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

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
      if (specifier.startsWith('node:')) return require(specifier);
      return loadModule(
        specifier.replace('./', '').replace('.ts', '').replace('.js', ''),
      );
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}

const { getResendSettings, saveResendSettings, getResendStatus } =
  loadModule('resendService');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Test 1: Empty database default values
const defaultSettings = getResendSettings(db);
assert.equal(defaultSettings.provider, 'resend');
assert.equal(defaultSettings.resendApiKey, '');
assert.equal(defaultSettings.resendFromEmail, '');
assert.equal(defaultSettings.senderName, 'Katia Auto Sales & Repairs');

const initialStatus = getResendStatus(db);
assert.equal(initialStatus.configured, false);

// Test 2: Saving settings updates app_settings and status becomes configured
saveResendSettings(
  {
    provider: 'resend',
    resendApiKey: 're_test_123456789',
    resendFromEmail: 'invoices@katiaautosales.com',
    senderName: 'Katia Auto Sales',
  },
  db,
);

const updatedSettings = getResendSettings(db);
assert.equal(updatedSettings.provider, 'resend');
assert.equal(updatedSettings.resendApiKey, 're_test_123456789');
assert.equal(updatedSettings.resendFromEmail, 'invoices@katiaautosales.com');
assert.equal(updatedSettings.senderName, 'Katia Auto Sales');

const updatedStatus = getResendStatus(db);
assert.equal(updatedStatus.configured, true);
assert.equal(updatedStatus.fromEmail, 'invoices@katiaautosales.com');
assert.equal(updatedStatus.senderName, 'Katia Auto Sales');

// Test 3: Partial updates preserve existing values
saveResendSettings(
  {
    provider: 'gmail',
  },
  db,
);

const providerChanged = getResendSettings(db);
assert.equal(providerChanged.provider, 'gmail');
assert.equal(providerChanged.resendApiKey, 're_test_123456789');
assert.equal(providerChanged.resendFromEmail, 'invoices@katiaautosales.com');

console.log('✓ Resend service configuration and status verified');
