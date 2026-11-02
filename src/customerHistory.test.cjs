const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the shared TypeScript helpers without adding a test runner dependency.
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

const { customerProfiles, orderCustomerKey, filterCustomers } =
  load('customerHistory');
const order = {
  id: 'old',
  orderNumber: 'RO-00001',
  customerName: 'Original Name',
  phone: 'old phone',
  address: 'old address',
  vehicleYear: '2021',
  vehicleMake: 'Honda',
  vehicleModel: 'Accord',
  vin: 'VIN-1',
  licensePlate: 'PLATE',
  dateIn: '2026-10-01',
  datePromised: '',
  status: 'open',
  total: 100,
  createdAt: '2026-10-01T00:00:00Z',
};
const before = JSON.stringify(order);
const contact = {
  key: 'original name',
  name: 'Renamed Customer',
  phone: 'new phone',
  address: 'new address',
};
const future = {
  ...order,
  id: 'new',
  orderNumber: 'RO-00002',
  customerKey: contact.key,
  customerName: contact.name,
};
let profiles = customerProfiles([future, order], [contact]);
assert.equal(profiles.length, 1);
assert.equal(profiles[0].key, contact.key);
assert.equal(profiles[0].name, contact.name);
assert.equal(profiles[0].phone, contact.phone);
assert.equal(profiles[0].address, contact.address);
assert.equal(profiles[0].orders.length, 2);
assert.equal(profiles[0].vehicles.length, 1);
assert.equal(JSON.stringify(order), before);
assert.equal(
  orderCustomerKey({ customerName: contact.name }, [contact]),
  contact.key,
);
profiles = customerProfiles(
  [future, order],
  [{ ...contact, name: 'Renamed Again', phone: '', address: '' }],
);
assert.equal(profiles.length, 1);
assert.equal(profiles[0].name, 'Renamed Again');
assert.equal(profiles[0].phone, '');
assert.equal(profiles[0].orders.length, 2);
assert.equal(
  customerProfiles([order], [{ ...contact, name: '' }])[0].name,
  order.customerName,
);
const searchable = customerProfiles(
  [order],
  [{ ...contact, phone: '(630) 555-0177' }],
);
for (const query of [
  'renamed',
  '  RENAMED CUSTOMER ',
  '630555',
  '555-0177',
  'vin1',
  'plate',
]) {
  assert.equal(filterCustomers(searchable, query).length, 1, query);
}
assert.equal(filterCustomers(searchable, 'unmatched').length, 0);
assert.equal(filterCustomers(searchable, '   '), searchable);
assert.equal(filterCustomers(searchable, 'original name').length, 0);
// Verify 5 most recent default limit and search filtering
const testOrders = Array.from({ length: 8 }, (_, i) => ({
  ...order,
  id: `order-${i + 1}`,
  orderNumber: `RO-0000${i + 1}`,
  customerName: `Customer ${i + 1}`,
  phone: `(630) 555-010${i + 1}`,
  dateIn: `2026-10-0${i + 1}`,
  createdAt: `2026-10-0${i + 1}T12:00:00Z`,
}));
const eightProfiles = customerProfiles(testOrders);
assert.equal(eightProfiles.length, 8);
const sortedProfiles = [...eightProfiles].sort((a, b) => {
  const dateA = a.orders[0]?.dateIn || a.lastVisit || '';
  const dateB = b.orders[0]?.dateIn || b.lastVisit || '';
  return dateB.localeCompare(dateA);
});
assert.equal(sortedProfiles.slice(0, 5).length, 5);
assert.equal(sortedProfiles.slice(0, 5)[0].name, 'Customer 8');
assert.equal(sortedProfiles.slice(0, 5)[4].name, 'Customer 4');

// Verify custom added vehicle via Add Vehicle modal
const customVehicle = {
  id: 'veh-custom-1',
  customerKey: contact.key,
  year: '2024',
  make: 'Toyota',
  model: 'RAV4',
  vin: '4T3BWRFV2RU999999',
  licensePlate: 'NEW-C4R',
  mileage: '12,500',
  createdAt: '2026-11-01T12:00:00Z',
};
const profilesWithCustom = customerProfiles(
  [order],
  [contact],
  [customVehicle],
);
assert.equal(profilesWithCustom.length, 1);
assert.equal(profilesWithCustom[0].vehicles.length, 2);
const added = profilesWithCustom[0].vehicles.find(
  (v) => v.vehicleModel === 'RAV4',
);
assert.ok(added, 'Added custom vehicle should be present in customer profile');
assert.equal(added.vehicleYear, '2024');
assert.equal(added.licensePlate, 'NEW-C4R');
assert.equal(added.label, '2024 Toyota RAV4');

console.log(
  'Customer rename preserves contacts, vehicles, history, and historical order data.',
);
