const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(name) {
  const filename = path.join(__dirname, `${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (specifier) => load(specifier.replace('./', '')),
    module,
    module.exports,
  );
  return module.exports;
}

const { receiptHtml } = load('receipt');

const dummyBlankOrder = {
  id: 'blank',
  orderNumber: 'RO-________',
  customerName: '',
  phone: '',
  email: '',
  address: '',
  vehicleYear: '',
  vehicleMake: '',
  vehicleModel: '',
  vin: '',
  licensePlate: '',
  mileage: '',
  dateIn: '',
  datePromised: '',
  concerns: '',
  charges: [],
  createdAt: new Date().toISOString(),
  total: 0,
  legacy: {},
};

// 1. Modern blank template
const modernHtml = receiptHtml(
  dummyBlankOrder,
  { receiptStyle: 'modern' },
  { isBlank: true },
);
assert.ok(
  !modernHtml.includes('$0.00'),
  'Modern blank receipt must not contain $0.00',
);
assert.ok(
  !modernHtml.includes('Includes tax'),
  'Modern blank receipt must not claim includes tax',
);
assert.ok(
  modernHtml.includes('write-line'),
  'Modern blank receipt must include write-in lines',
);
assert.ok(
  modernHtml.includes('RO-___________'),
  'Modern blank receipt must render write-in order number',
);
console.log(
  '✓ Modern blank receipt verified: zero $0.00 occurrences, write lines present',
);

// 2. Classic blank template
const classicHtml = receiptHtml(
  dummyBlankOrder,
  { receiptStyle: 'classic' },
  { isBlank: true },
);
assert.ok(
  !classicHtml.includes('$0.00'),
  'Classic blank receipt must not contain $0.00',
);
assert.ok(
  classicHtml.includes('write-line') || classicHtml.includes('&nbsp;'),
  'Classic blank receipt must include write-in spaces',
);
console.log(
  '✓ Classic blank receipt verified: zero $0.00 occurrences, write spaces present',
);
