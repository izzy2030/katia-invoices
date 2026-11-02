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

const { resolveEmailRoute } = loadModule('emailRouting');

assert.deepEqual(resolveEmailRoute(null), { kind: 'none' });
assert.deepEqual(resolveEmailRoute({ connected: false }), { kind: 'none' });
assert.deepEqual(resolveEmailRoute({ connected: true }), {
  kind: 'gmail',
  senderDescription: 'connected Gmail',
});
assert.deepEqual(
  resolveEmailRoute({ connected: true, email: 'shop@example.com' }),
  {
    kind: 'gmail',
    senderDescription: 'connected Gmail (shop@example.com)',
  },
);

console.log('✓ Email provider routing verified');
