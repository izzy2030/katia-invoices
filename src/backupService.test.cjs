const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

console.log('--- Starting Katia Invoices Backup & Restore Service Tests ---');

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

const backupService = loadModule('backupService');
const {
  ensureBackupSchema,
  buildBackupPayload,
  parseBackupJson,
  importBackupPayload,
  exportSqliteSnapshot,
  restoreBackupFromFile,
  listWorkOrdersFromDb,
  listCustomerContactsFromDb,
  getSettingsFromDb,
} = backupService;

// Test 1: Full JSON Backup Export & Replace Restore Round-Trip
{
  const pc1Db = new DatabaseSync(':memory:');
  ensureBackupSchema(pc1Db);

  const samplePayload = {
    version: 1,
    exportedAt: '2026-11-01T12:00:00.000Z',
    workOrders: [
      {
        id: 'order-uuid-1',
        orderNumber: 'RO-00010',
        customerName: 'Elena Rostova',
        phone: '(630) 555-0199',
        email: 'elena@example.com',
        address: '442 Oak Park Ave',
        vehicleYear: '2022',
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        vin: '4T1BF1FK0CU123456',
        licensePlate: 'IL-ELENA',
        mileage: '28,400',
        dateIn: '2026-10-28',
        datePromised: '2026-11-02',
        concerns: 'Rear bumper scratch and dent repair',
        status: 'in_progress',
        taxRate: '8.25',
        charges: [
          {
            id: 'c1',
            kind: 'parts',
            description: 'Rear bumper cover',
            quantity: '1',
            unitPrice: '420.00',
            amount: '420.00',
            taxable: true,
          },
          {
            id: 'c2',
            kind: 'labor',
            description: 'Body & paint labor',
            quantity: '4',
            unitPrice: '95.00',
            amount: '380.00',
            taxable: false,
          },
        ],
        createdAt: '2026-10-28T14:20:00.000Z',
      },
    ],
    customerContacts: [
      {
        key: 'elena rostova',
        name: 'Elena Rostova',
        phone: '(630) 555-0199',
        address: '442 Oak Park Ave',
        email: 'elena@example.com',
      },
    ],
    settings: {
      taxRate: '8.25',
      nextOrderNumber: '11',
      shopName: 'Katia Auto Sales & Repairs - West',
      shopPhone: '(630) 907-7198',
      shopAddress: '1005 Rural St, Aurora, IL 60505',
      shopCity: 'Aurora',
      shopState: 'IL',
      shopZip: '60505',
      defaultTerms: 'Due upon completion',
      defaultWrittenBy: 'Katia',
      defaultTechnician: 'Marco',
      defaultCallWhenReady: 'Yes',
      defaultSaveOldParts: 'No',
      receiptStyle: 'classic',
      defaults: {
        parts: true,
        labor: false,
        paint: false,
        sublet: false,
        towing: false,
        storage: false,
        shop_supplies: true,
        hazmat: false,
        other: false,
      },
    },
  };

  const res = importBackupPayload(pc1Db, samplePayload, 'replace');
  assert.equal(res.ordersAdded, 1);
  assert.equal(res.ordersUpdated, 0);
  assert.equal(res.contactsSaved, 1);
  assert.equal(res.settingsRestored, true);
  assert.equal(res.totalOrders, 1);
  assert.equal(res.totalContacts, 1);

  const exported = buildBackupPayload(pc1Db);
  assert.equal(exported.workOrders.length, 1);
  assert.equal(exported.workOrders[0].orderNumber, 'RO-00010');
  assert.equal(exported.workOrders[0].total, 834.65); // 420 + 380 + (420 * 0.0825 = 34.65)
  assert.equal(exported.settings.shopName, 'Katia Auto Sales & Repairs - West');
  assert.equal(exported.settings.nextOrderNumber, '11');
  assert.equal(exported.settings.receiptStyle, 'classic');
  console.log('✓ Full JSON export and replace restore round-trip verified');
}

// Test 2: Merge Mode Replaces Auto-Seeded "Demo Customer" (RO-00001) Without UNIQUE Collision
{
  const pc2Db = new DatabaseSync(':memory:');
  ensureBackupSchema(pc2Db);

  // Simulate auto-seeded Demo Customer on PC #2 with a random UUID
  importBackupPayload(
    pc2Db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'demo-random-uuid-pc2',
          orderNumber: 'RO-00001',
          customerName: 'Demo Customer',
          vehicleYear: '2020',
          vehicleMake: 'Honda',
          vehicleModel: 'Civic',
          charges: [],
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'replace',
  );

  // Import real backup from PC #1 that also has RO-00001 for a real customer
  const mergeResult = importBackupPayload(
    pc2Db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'real-pc1-uuid-1',
          orderNumber: 'RO-00001',
          customerName: 'Maria Gomez',
          vehicleYear: '2023',
          vehicleMake: 'Ford',
          vehicleModel: 'Bronco',
          charges: [
            {
              id: '1',
              kind: 'labor',
              description: 'Alignment',
              amount: '125.00',
              taxable: false,
            },
          ],
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'merge',
  );

  assert.equal(mergeResult.ordersAdded, 1);
  assert.equal(mergeResult.totalOrders, 1);
  const orders = listWorkOrdersFromDb(pc2Db);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, 'real-pc1-uuid-1');
  assert.equal(orders[0].orderNumber, 'RO-00001');
  assert.equal(orders[0].customerName, 'Maria Gomez');
  console.log(
    '✓ Merge mode cleanly replaces auto-seeded Demo Customer RO-00001 without constraint collision',
  );
}

// Test 3: Merge Mode Resolves Colliding Order Numbers for Different Customers & Updates next_order_number
{
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);

  // PC #2 has RO-00005 for Alice Smith
  importBackupPayload(
    db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'pc2-alice-id',
          orderNumber: 'RO-00005',
          customerName: 'Alice Smith',
          vehicleYear: '2021',
          vehicleMake: 'Subaru',
          vehicleModel: 'Forester',
          charges: [],
          createdAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'replace',
  );

  // Merge PC #1 backup which ALSO has RO-00005 but for Bob Jones, plus Alice Smith's updated order
  const mergeRes = importBackupPayload(
    db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'pc1-bob-id',
          orderNumber: 'RO-00005',
          customerName: 'Bob Jones',
          vehicleYear: '2019',
          vehicleMake: 'Chevy',
          vehicleModel: 'Tahoe',
          charges: [],
          createdAt: '2026-10-21T10:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'merge',
  );

  assert.equal(mergeRes.ordersAdded, 1);
  assert.equal(mergeRes.totalOrders, 2);
  const allOrders = listWorkOrdersFromDb(db);
  const alice = allOrders.find((o) => o.customerName === 'Alice Smith');
  const bob = allOrders.find((o) => o.customerName === 'Bob Jones');
  assert.ok(alice);
  assert.ok(bob);
  assert.equal(alice.orderNumber, 'RO-00005');
  assert.equal(bob.orderNumber, 'RO-00006');
  assert.equal(getSettingsFromDb(db).nextOrderNumber, '7');

  // Re-importing the exact same backup in merge mode must be idempotent (no duplicates!)
  const secondMerge = importBackupPayload(db, buildBackupPayload(db), 'merge');
  assert.equal(secondMerge.ordersAdded, 0);
  assert.equal(secondMerge.ordersUpdated, 2);
  assert.equal(secondMerge.totalOrders, 2);
  console.log(
    '✓ Merge mode orderNumber collision resolution and idempotency verified',
  );
}

// Test 3b: Merge Mode Preserves Distinct Orders for the SAME Repeat Customer with Colliding Order Numbers & Replaces Morgan Example (DEMO)
{
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);

  // PC #2 has auto-seeded Morgan Example (DEMO) at RO-00002 AND repeat customer Carlos Rivera at RO-00005 (2021 F-150 bumper repair)
  importBackupPayload(
    db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'demo-morgan-pc2',
          orderNumber: 'RO-00002',
          customerName: 'Morgan Example (DEMO)',
          vehicleYear: '2022',
          vehicleMake: 'Toyota',
          vehicleModel: 'Camry SE',
          charges: [],
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          id: 'carlos-pc2-f150-uuid',
          orderNumber: 'RO-00005',
          customerName: 'Carlos Rivera',
          vehicleYear: '2021',
          vehicleMake: 'Ford',
          vehicleModel: 'F-150',
          charges: [
            {
              kind: 'labor',
              description: 'Bumper paint',
              amount: '1200.00',
              taxable: false,
            },
          ],
          createdAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'replace',
  );

  // Merge PC #1 backup which has a real RO-00002 AND a different order for Carlos Rivera that also got RO-00005 on PC #1 (2019 Camry brake job)
  const mergeRes = importBackupPayload(
    db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'real-ro2-pc1-uuid',
          orderNumber: 'RO-00002',
          customerName: 'Diana Prince',
          vehicleYear: '2023',
          vehicleMake: 'Porsche',
          vehicleModel: '911',
          charges: [],
          createdAt: '2026-10-18T10:00:00.000Z',
        },
        {
          id: 'carlos-pc1-camry-uuid',
          orderNumber: 'RO-00005',
          customerName: 'Carlos Rivera',
          vehicleYear: '2019',
          vehicleMake: 'Toyota',
          vehicleModel: 'Camry',
          charges: [
            {
              kind: 'parts',
              description: 'Brake pads',
              amount: '400.00',
              taxable: false,
            },
          ],
          createdAt: '2026-10-21T10:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'merge',
  );

  assert.equal(mergeRes.ordersAdded, 2);
  assert.equal(mergeRes.ordersUpdated, 0);
  assert.equal(mergeRes.totalOrders, 3); // Morgan Example (DEMO) replaced + BOTH Carlos Rivera orders preserved!

  const orders = listWorkOrdersFromDb(db);
  const carlosOrders = orders.filter((o) => o.customerName === 'Carlos Rivera');
  assert.equal(
    carlosOrders.length,
    2,
    'Both distinct orders for the same repeat customer must be preserved in Merge mode',
  );
  const f150 = carlosOrders.find((o) => o.id === 'carlos-pc2-f150-uuid');
  const camry = carlosOrders.find((o) => o.id === 'carlos-pc1-camry-uuid');
  assert.equal(f150.orderNumber, 'RO-00005');
  assert.equal(camry.orderNumber, 'RO-00006');
  assert.ok(!orders.some((o) => o.customerName === 'Morgan Example (DEMO)'));

  // Re-importing the same PC #1 backup again in merge mode must update in place without adding a third Carlos order
  const reMerge = importBackupPayload(
    db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'carlos-pc1-camry-uuid',
          orderNumber: 'RO-00005',
          customerName: 'Carlos Rivera',
          vehicleYear: '2019',
          vehicleMake: 'Toyota',
          vehicleModel: 'Camry',
          charges: [
            {
              kind: 'parts',
              description: 'Brake pads & rotors',
              amount: '550.00',
              taxable: false,
            },
          ],
          createdAt: '2026-10-21T10:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'merge',
  );
  assert.equal(reMerge.ordersAdded, 0);
  assert.equal(reMerge.ordersUpdated, 1);
  assert.equal(reMerge.totalOrders, 3);
  const updatedCamry = listWorkOrdersFromDb(db).find(
    (o) => o.id === 'carlos-pc1-camry-uuid',
  );
  assert.equal(updatedCamry.orderNumber, 'RO-00006');
  assert.equal(updatedCamry.total, 550);
  console.log(
    '✓ Same-customer colliding orderNumber preservation and Morgan Example (DEMO) replacement verified',
  );
}

// Test 4: File-based SQLite (.sqlite) Snapshot Export & Restore + JSON File Restore + Active DB Guard + Legacy Schema
async function runFileTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'katia-backup-test-'));
  const sqliteFile = path.join(tmpDir, 'exported-shop.sqlite');
  const jsonFile = path.join(tmpDir, 'exported-shop.json');
  const legacySqliteFile = path.join(tmpDir, 'legacy-no-status.sqlite');

  try {
    const sourceDb = new DatabaseSync(':memory:');
    ensureBackupSchema(sourceDb);
    importBackupPayload(
      sourceDb,
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        workOrders: [
          {
            id: 'sqlite-order-1',
            orderNumber: 'RO-00042',
            customerName: 'Victor Vega',
            vehicleYear: '2024',
            vehicleMake: 'BMW',
            vehicleModel: 'M3',
            charges: [
              {
                id: '1',
                kind: 'parts',
                description: 'Carbon diffuser',
                amount: '950.00',
                taxable: true,
              },
            ],
            taxRate: '10',
            createdAt: '2026-10-30T08:00:00.000Z',
          },
        ],
        customerContacts: [
          {
            key: 'victor vega',
            name: 'Victor Vega',
            phone: '(312) 555-0144',
            address: '77 Michigan Ave',
            email: 'victor@example.com',
          },
        ],
      },
      'replace',
    );

    // 4a. Guard against overwriting the active database file or leaving stale -wal/-shm files
    await assert.rejects(
      () => exportSqliteSnapshot(sourceDb, sqliteFile, sqliteFile),
      /Cannot overwrite the active live database file/,
    );
    fs.writeFileSync(`${sqliteFile}-wal`, 'stale-wal-bytes', 'utf8');
    fs.writeFileSync(`${sqliteFile}-shm`, 'stale-shm-bytes', 'utf8');

    // Export to .sqlite file via VACUUM INTO and restore into targetDb1
    await exportSqliteSnapshot(sourceDb, sqliteFile);
    assert.ok(fs.existsSync(sqliteFile), 'Exported SQLite file must exist');
    assert.ok(
      !fs.existsSync(`${sqliteFile}-wal`),
      'Stale -wal file must be removed before VACUUM INTO',
    );
    assert.ok(
      !fs.existsSync(`${sqliteFile}-shm`),
      'Stale -shm file must be removed before VACUUM INTO',
    );

    const targetDb1 = new DatabaseSync(':memory:');
    ensureBackupSchema(targetDb1);
    await assert.rejects(
      () => restoreBackupFromFile(targetDb1, sqliteFile, 'replace', sqliteFile),
      /Cannot restore from the currently active database file/,
    );
    const sqliteRestoreRes = await restoreBackupFromFile(
      targetDb1,
      sqliteFile,
      'replace',
    );
    assert.equal(sqliteRestoreRes.sourceFormat, 'sqlite');
    assert.equal(sqliteRestoreRes.fileName, 'exported-shop.sqlite');
    assert.equal(sqliteRestoreRes.ordersAdded, 1);
    assert.equal(sqliteRestoreRes.totalOrders, 1);
    assert.equal(sqliteRestoreRes.totalContacts, 1);
    assert.equal(
      listWorkOrdersFromDb(targetDb1)[0].customerName,
      'Victor Vega',
    );
    assert.equal(listWorkOrdersFromDb(targetDb1)[0].total, 1045.0);
    assert.equal(
      listCustomerContactsFromDb(targetDb1)[0].email,
      'victor@example.com',
    );

    // 4b. Write JSON file with UTF-8 BOM and restore into targetDb2
    const jsonPayload = buildBackupPayload(sourceDb);
    fs.writeFileSync(
      jsonFile,
      '\uFEFF' + JSON.stringify(jsonPayload, null, 2),
      'utf8',
    );

    const targetDb2 = new DatabaseSync(':memory:');
    ensureBackupSchema(targetDb2);
    const jsonRestoreRes = await restoreBackupFromFile(
      targetDb2,
      jsonFile,
      'merge',
    );
    assert.equal(jsonRestoreRes.sourceFormat, 'json');
    assert.equal(jsonRestoreRes.fileName, 'exported-shop.json');
    assert.equal(jsonRestoreRes.ordersAdded, 1);
    assert.equal(listWorkOrdersFromDb(targetDb2)[0].orderNumber, 'RO-00042');

    // 4c. Restore from a legacy .sqlite database whose work_orders table lacks the `status` column
    const legacyDb = new DatabaseSync(legacySqliteFile);
    legacyDb.exec(`
      CREATE TABLE work_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        vehicle TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    legacyDb
      .prepare(
        'INSERT INTO work_orders (id, order_number, customer_name, vehicle, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        'legacy-id-1',
        'RO-00009',
        'Legacy Shop Customer',
        '2018 Honda Civic',
        JSON.stringify({
          customerName: 'Legacy Shop Customer',
          vehicleYear: '2018',
          vehicleMake: 'Honda',
          vehicleModel: 'Civic',
          charges: [
            {
              kind: 'paint',
              description: 'Legacy paint kind normalized to other',
              amount: '300.00',
              taxable: false,
            },
          ],
        }),
        '2026-09-01T10:00:00.000Z',
      );
    legacyDb.close();

    const targetDb3 = new DatabaseSync(':memory:');
    ensureBackupSchema(targetDb3);
    const legacyRestoreRes = await restoreBackupFromFile(
      targetDb3,
      legacySqliteFile,
      'replace',
    );
    assert.equal(legacyRestoreRes.ordersAdded, 1);
    const restoredLegacyOrder = listWorkOrdersFromDb(targetDb3)[0];
    assert.equal(restoredLegacyOrder.customerName, 'Legacy Shop Customer');
    assert.equal(restoredLegacyOrder.total, 300);
    assert.equal(restoredLegacyOrder.charges[0].kind, 'other');
    console.log(
      '✓ File-based .sqlite snapshot export/restore, active DB guard, stale WAL cleanup, UTF-8 BOM .json, and legacy schema verified',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Test 5: Edge Cases, Malformed Inputs, and Atomic Transaction Rollback
{
  assert.throws(() => parseBackupJson(''), /file is empty/);
  assert.throws(() => parseBackupJson('   '), /file is empty/);
  assert.throws(() => parseBackupJson('{bad json'), /could not parse JSON/);
  assert.throws(
    () => parseBackupJson('["not-an-object"]'),
    /root value must be a JSON object/,
  );
  assert.throws(
    () => parseBackupJson('{"version": 99, "workOrders": []}'),
    /Unsupported backup file version/,
  );
  assert.throws(
    () => parseBackupJson('{"version": 1}'),
    /missing workOrders, customerContacts, or settings data/,
  );
  assert.throws(
    () => parseBackupJson('{"workOrders": "invalid"}'),
    /"workOrders" must be an array/,
  );

  // Verify transaction rollback on invalid order inside backup
  const db = new DatabaseSync(':memory:');
  ensureBackupSchema(db);
  importBackupPayload(
    db,
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders: [
        {
          id: 'existing-safe-order',
          orderNumber: 'RO-00001',
          customerName: 'Safe Customer',
          charges: [],
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      customerContacts: [],
    },
    'replace',
  );

  assert.throws(
    () =>
      importBackupPayload(
        db,
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          workOrders: [
            {
              id: 'bad-charges-order',
              orderNumber: 'RO-00002',
              customerName: 'Bad Charges Customer',
              charges: 'not-an-array',
            },
          ],
          customerContacts: [],
        },
        'replace',
      ),
    /"charges" must be an array/,
  );

  assert.throws(
    () =>
      importBackupPayload(
        db,
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          workOrders: [
            {
              id: 'corrupt-order',
              orderNumber: 'RO-00002',
              customerName: 'Corrupt Customer',
              charges: [
                {
                  id: '1',
                  kind: 'parts',
                  description: 'Negative price',
                  unitPrice: '-500',
                  amount: '-500',
                },
              ],
            },
          ],
          customerContacts: [],
        },
        'replace',
      ),
    /invalid or negative amounts/,
  );

  // Existing order must remain intact after failed 'replace' import
  const remaining = listWorkOrdersFromDb(db);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].customerName, 'Safe Customer');
  console.log(
    '✓ Input validation and atomic rollback on corrupt backup data verified',
  );
}

runFileTests()
  .then(() => {
    console.log('--- ALL BACKUP & RESTORE TESTS PASSED (100% SUCCESS) ---');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
