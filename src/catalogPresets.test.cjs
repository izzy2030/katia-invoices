const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');

test('Catalog Presets and Body Shop defaults verification', async (t) => {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE catalog_presets (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      shortcut TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      part_number TEXT NOT NULL DEFAULT '',
      default_price REAL NOT NULL DEFAULT 0,
      default_quantity REAL NOT NULL DEFAULT 1,
      taxable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const samplePresets = [
    {
      category: 'labor',
      shortcut: 'bumper-ri',
      name: 'Front Bumper Cover R&I',
      description: 'Front bumper cover - remove & install (R&I)',
      partNumber: 'LAB-101',
      defaultPrice: 65,
      defaultQuantity: 1.5,
      taxable: false,
    },
    {
      category: 'labor',
      shortcut: 'bumper-paint',
      name: 'Front Bumper Refinish',
      description: 'Front bumper cover - refinish & clear coat application',
      partNumber: 'PNT-201',
      defaultPrice: 65,
      defaultQuantity: 2.5,
      taxable: false,
    },
    {
      category: 'parts',
      shortcut: 'paint-supplies',
      name: 'Paint & Refinish Materials',
      description:
        'Automotive paint supplies, primer, basecoat, clearcoat & reducers',
      partNumber: 'MAT-001',
      defaultPrice: 42,
      defaultQuantity: 1.0,
      taxable: true,
    },
  ];

  await t.test('Seed sample presets into database', () => {
    const insert = db.prepare(`
      INSERT INTO catalog_presets (
        id, category, shortcut, name, description, part_number,
        default_price, default_quantity, taxable, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of samplePresets) {
      insert.run(
        randomUUID(),
        p.category,
        p.shortcut,
        p.name,
        p.description,
        p.partNumber,
        p.defaultPrice,
        p.defaultQuantity,
        p.taxable ? 1 : 0,
        new Date().toISOString(),
      );
    }

    const count = db
      .prepare('SELECT COUNT(*) as count FROM catalog_presets')
      .get().count;
    assert.equal(count, 3);
  });

  await t.test('Query presets and verify category & pricing types', () => {
    const rows = db
      .prepare('SELECT * FROM catalog_presets WHERE shortcut = ?')
      .all('bumper-paint');
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.name, 'Front Bumper Refinish');
    assert.equal(row.category, 'labor');
    assert.equal(row.default_price, 65);
    assert.equal(row.default_quantity, 2.5);
    assert.equal(row.taxable, 0);
  });

  await t.test('Update existing preset', () => {
    const update = db.prepare(`
      UPDATE catalog_presets
      SET default_price = ?, description = ?
      WHERE shortcut = ?
    `);
    update.run(70, 'Updated bumper refinish description', 'bumper-paint');

    const updated = db
      .prepare('SELECT * FROM catalog_presets WHERE shortcut = ?')
      .get('bumper-paint');
    assert.equal(updated.default_price, 70);
    assert.equal(updated.description, 'Updated bumper refinish description');
  });

  await t.test('Delete preset from catalog', () => {
    const del = db.prepare('DELETE FROM catalog_presets WHERE shortcut = ?');
    del.run('bumper-ri');

    const check = db
      .prepare(
        'SELECT COUNT(*) as count FROM catalog_presets WHERE shortcut = ?',
      )
      .get('bumper-ri');
    assert.equal(check.count, 0);
  });
});
