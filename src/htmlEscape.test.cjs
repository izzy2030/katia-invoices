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

const { escapeHtml } = loadModule('html');

assert.equal(
  escapeHtml(`A & B <tag> "quote" 'apostrophe'`),
  'A &amp; B &lt;tag&gt; &quot;quote&quot; &#39;apostrophe&#39;',
);
assert.equal(escapeHtml(''), '');
assert.equal(escapeHtml(null), '');
assert.equal(escapeHtml(undefined), '');
assert.equal(escapeHtml('RO-00001'), 'RO-00001');
assert.equal(escapeHtml(42), '42');

console.log('✓ Shared HTML escaping verified');
