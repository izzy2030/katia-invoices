const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

console.log('--- Starting Katia Invoices Settings Store Parity Tests ---');

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

const { ensureBackupSchema, getSettingsFromDb, writeSettingsToDb } =
  loadModule('backupService');
const { builtInTaxDefaults } = loadModule('workOrder');

// Test 1: an empty database returns the documented defaults.
{
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);
  const settings = getSettingsFromDb(db);
  assert.equal(settings.taxRate, '', 'taxRate defaults to empty');
  assert.equal(settings.nextOrderNumber, '1');
  assert.equal(settings.receiptStyle, 'modern');
  assert.equal(settings.shopName, 'Katia Auto Sales & Repairs');
  assert.equal(settings.shopPhone, '(630) 907-7198');
  assert.equal(settings.shopAddress, '1005 Rural St, Aurora, IL 60505');
  assert.equal(settings.shopCity, 'Aurora');
  assert.equal(settings.shopState, 'IL');
  assert.equal(settings.shopZip, '60505');
  assert.equal(settings.defaultTerms, 'Balance due at vehicle pickup');
  assert.equal(settings.defaultWrittenBy, '');
  assert.equal(settings.defaultTechnician, '');
  assert.equal(settings.defaultCallWhenReady, 'Yes');
  assert.equal(settings.defaultSaveOldParts, 'Yes');
  assert.deepEqual(settings.defaults, builtInTaxDefaults);
  console.log('✓ Empty database returns documented TaxSettings defaults');
}

// Test 2: a full TaxSettings round-trips field-for-field.
{
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);
  const full = {
    taxRate: '8.25',
    defaults: {
      ...builtInTaxDefaults,
      labor: false,
      sublet: false,
      disposal: false,
    },
    nextOrderNumber: '42',
    shopName: 'Katia Auto Sales & Repairs',
    shopPhone: '(630) 555-0100',
    shopAddress: '123 Test Ave',
    shopCity: 'Naperville',
    shopState: 'IL',
    shopZip: '60540',
    defaultTerms: 'Net 30',
    defaultWrittenBy: 'Izzy',
    defaultTechnician: 'Sam',
    defaultCallWhenReady: 'No',
    defaultSaveOldParts: 'No',
    receiptStyle: 'classic',
  };
  writeSettingsToDb(db, full);
  const read = getSettingsFromDb(db);
  for (const key of Object.keys(full)) {
    assert.deepEqual(read[key], full[key], `round-trip mismatch for ${key}`);
  }
  assert.deepEqual(read, full);
  console.log(
    '✓ Full TaxSettings round-trips every field, including defaults and receiptStyle',
  );
}

// Test 3: writer coercions the Phase 4 merge must preserve.
{
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);
  writeSettingsToDb(db, {
    taxRate: ' 7.5 ',
    nextOrderNumber: 'RO-00099',
    shopName: '  Katia  ',
    receiptStyle: 'invalid-style',
  });
  const read = getSettingsFromDb(db);
  assert.equal(read.taxRate, '7.5');
  assert.equal(read.nextOrderNumber, '99');
  assert.equal(read.shopName, 'Katia');
  assert.equal(read.receiptStyle, 'modern');
  assert.equal(read.shopZip, '60505', 'missing fields fall back to defaults');
  console.log(
    '✓ Writer trims text, extracts order digits, and normalizes receiptStyle',
  );
}

// Test 4: invalid tax rates are rejected, not silently stored.
{
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);
  assert.throws(
    () => writeSettingsToDb(db, { taxRate: '-1' }),
    /nonnegative number/,
  );
  assert.throws(
    () => writeSettingsToDb(db, { taxRate: 'not-a-number' }),
    /nonnegative number/,
  );
  console.log('✓ Invalid tax rates are rejected');
}

console.log('--- ALL SETTINGS STORE PARITY TESTS PASSED ---');
