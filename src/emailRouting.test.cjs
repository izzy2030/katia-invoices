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

// Backward compatibility tests with legacy single-argument signature
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

// Resend routing tests
assert.deepEqual(
  resolveEmailRoute(null, {
    configured: true,
    fromEmail: 'invoices@katia.com',
  }),
  {
    kind: 'resend',
    senderDescription: 'Resend (invoices@katia.com)',
  },
);

// Fallback & Priority tests
assert.deepEqual(
  resolveEmailRoute(
    { connected: false },
    { configured: true, fromEmail: 'invoices@katia.com' },
    'gmail',
  ),
  {
    kind: 'resend',
    senderDescription: 'Resend (invoices@katia.com)',
  },
  'Should fall back to Resend when Gmail is preferred but disconnected',
);

assert.deepEqual(
  resolveEmailRoute(
    { connected: true, email: 'shop@gmail.com' },
    { configured: false },
    'resend',
  ),
  {
    kind: 'gmail',
    senderDescription: 'connected Gmail (shop@gmail.com)',
  },
  'Should fall back to Gmail when Resend is preferred but unconfigured',
);

assert.deepEqual(
  resolveEmailRoute(
    { connected: true, email: 'shop@gmail.com' },
    { configured: true, fromEmail: 'invoices@katia.com' },
    'resend',
  ),
  {
    kind: 'resend',
    senderDescription: 'Resend (invoices@katia.com)',
  },
  'Should choose Resend when both are available and Resend is preferred',
);

console.log('✓ Email provider routing and fallback verified');
