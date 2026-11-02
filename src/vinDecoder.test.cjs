const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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

const { formatVehicleName } = loadModule('vinDecoder');

assert.equal(formatVehicleName('TOYOTA'), 'Toyota');
assert.equal(formatVehicleName('CHEVROLET'), 'Chevrolet');
assert.equal(formatVehicleName('bmw'), 'BMW');
assert.equal(formatVehicleName('GMC'), 'GMC');
assert.equal(formatVehicleName('GRAND CHEROKEE'), 'Grand Cherokee');
assert.equal(formatVehicleName('F-150'), 'F-150');

console.log('✓ VIN decoder format verified');
