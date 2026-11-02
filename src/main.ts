import {
  customerKey,
  customerProfiles,
  orderCustomerKey,
  type CustomerContact,
} from './customerHistory';
import { receiptHtml } from './receipt';
import {
  builtInTaxDefaults,
  normalizeDashboardPreferences,
  type DashboardPreferences,
  defaultLegacy,
  normalizeInput,
  normalizeReceiptStyle,
  normalizeTaxDefaults,
  chargeTotals,
  otherChargesTotal,
  normalizeStatus,
  ORDER_STATUSES,
  orderStatusLabels,
  type EmailProvider,
  type EmailSendResult,
  type EmailSettings,
  type EmailDeliveryMetadata,
  type TaxSettings,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderStatus,
  type CatalogPreset,
  defaultBodyShopPresets,
} from './workOrder';
import {
  buildKatiaEmailBrandHeader,
  connectGmailAccount,
  disconnectGmailAccount,
  getGmailStatus,
  sendEmailViaGmailApi,
} from './gmailService';
import {
  saveGoogleOAuthCredentials,
  type GoogleOAuthCredentials,
} from './gmailAuth';
import {
  buildBackupPayload,
  exportSqliteSnapshot,
  restoreBackupFromFile,
  type BackupImportMode,
  type BackupImportResult,
} from './backupService';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import started from 'electron-squirrel-startup';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

let database: DatabaseSync;
let databaseFilePath = '';

function initializeDatabase() {
  const fileName = app.isPackaged
    ? 'katia-body-shop.sqlite'
    : 'katia-body-shop-dev.sqlite';
  databaseFilePath = path.join(app.getPath('userData'), fileName);
  database = new DatabaseSync(databaseFilePath);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      vehicle TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_contacts (
      customer_key TEXT PRIMARY KEY,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS customer_vehicles (
      id TEXT PRIMARY KEY,
      customer_key TEXT NOT NULL,
      year TEXT NOT NULL DEFAULT '',
      make TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      vin TEXT NOT NULL DEFAULT '',
      license_plate TEXT NOT NULL DEFAULT '',
      mileage TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_presets (
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
  const contactColumns = database
    .prepare('PRAGMA table_info(customer_contacts)')
    .all() as Array<{ name: string }>;
  if (!contactColumns.some((column) => column.name === 'name'))
    database.exec(
      "ALTER TABLE customer_contacts ADD COLUMN name TEXT NOT NULL DEFAULT ''",
    );
  if (!contactColumns.some((column) => column.name === 'email'))
    database.exec(
      "ALTER TABLE customer_contacts ADD COLUMN email TEXT NOT NULL DEFAULT ''",
    );

  try {
    const count = (
      database
        .prepare('SELECT COUNT(*) as count FROM catalog_presets')
        .get() as { count: number }
    ).count;
    if (count === 0) {
      const insert = database.prepare(`
        INSERT INTO catalog_presets (
          id, category, shortcut, name, description, part_number,
          default_price, default_quantity, taxable, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      database.exec('BEGIN IMMEDIATE;');
      const now = new Date().toISOString();
      for (const preset of defaultBodyShopPresets) {
        insert.run(
          randomUUID(),
          preset.category,
          preset.shortcut,
          preset.name,
          preset.description,
          preset.partNumber ?? '',
          preset.defaultPrice,
          preset.defaultQuantity ?? 1,
          preset.taxable ? 1 : 0,
          now,
        );
      }
      database.exec('COMMIT;');
    }
  } catch (seedErr) {
    console.warn('Could not auto-seed default body shop presets:', seedErr);
  }
}

function listWorkOrders(): WorkOrder[] {
  const rows = database
    .prepare(
      'SELECT id, order_number, data_json, created_at FROM work_orders ORDER BY created_at DESC',
    )
    .all() as Array<{
    id: string;
    order_number: string;
    data_json: string;
    created_at: string;
  }>;
  return rows.map((row) => {
    const order = normalizeInput(JSON.parse(row.data_json));
    return {
      ...order,
      total: chargeTotals(order).total,
      id: row.id,
      orderNumber: row.order_number,
      createdAt: row.created_at,
    };
  });
}

function listCustomerContacts(): CustomerContact[] {
  const rows = database
    .prepare(
      'SELECT customer_key, name, phone, address, email FROM customer_contacts ORDER BY customer_key',
    )
    .all() as Array<{
    customer_key: string;
    name: string;
    phone: string;
    address: string;
    email?: string;
  }>;
  return rows.map((row) => ({
    key: row.customer_key,
    name: row.name,
    phone: row.phone,
    address: row.address,
    email: row.email ?? '',
  }));
}

function saveCustomerContact(contact: CustomerContact): CustomerContact {
  const key = contact.key.trim();
  const profiles = customerProfiles(listWorkOrders(), listCustomerContacts());
  if (!profiles.some((profile) => profile.key === key))
    throw new Error('Customer not found.');
  const name = contact.name.trim();
  if (!name) throw new Error('Customer name is required.');
  if (
    profiles.some(
      (profile) =>
        profile.key !== key &&
        (customerKey(profile.name) === customerKey(name) ||
          profile.key === customerKey(name)),
    )
  )
    throw new Error('Another customer already uses that name.');
  const saved = {
    key,
    name,
    phone: (contact.phone ?? '').trim(),
    address: (contact.address ?? '').trim(),
    email: (contact.email ?? '').trim(),
  };
  database
    .prepare(
      'INSERT INTO customer_contacts (customer_key, name, phone, address, email) VALUES (?, ?, ?, ?, ?) ON CONFLICT(customer_key) DO UPDATE SET name = excluded.name, phone = excluded.phone, address = excluded.address, email = excluded.email',
    )
    .run(saved.key, saved.name, saved.phone, saved.address, saved.email);
  return saved;
}

function listCustomerVehicles() {
  const rows = database
    .prepare(
      'SELECT id, customer_key, year, make, model, vin, license_plate, mileage, created_at FROM customer_vehicles ORDER BY created_at DESC',
    )
    .all() as Array<{
    id: string;
    customer_key: string;
    year: string;
    make: string;
    model: string;
    vin: string;
    license_plate: string;
    mileage: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    customerKey: r.customer_key,
    year: r.year,
    make: r.make,
    model: r.model,
    vin: r.vin,
    licensePlate: r.license_plate,
    mileage: r.mileage,
    createdAt: r.created_at,
  }));
}

function saveCustomerVehicle(vehicle: {
  id?: string;
  customerKey: string;
  year: string;
  make: string;
  model: string;
  vin?: string;
  licensePlate?: string;
  mileage?: string;
}) {
  const id = vehicle.id || randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO customer_vehicles (id, customer_key, year, make, model, vin, license_plate, mileage, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         year = excluded.year,
         make = excluded.make,
         model = excluded.model,
         vin = excluded.vin,
         license_plate = excluded.license_plate,
         mileage = excluded.mileage`,
    )
    .run(
      id,
      vehicle.customerKey,
      (vehicle.year || '').trim(),
      (vehicle.make || '').trim(),
      (vehicle.model || '').trim(),
      (vehicle.vin || '').trim(),
      (vehicle.licensePlate || '').trim(),
      (vehicle.mileage || '').trim(),
      now,
    );
  return {
    id,
    customerKey: vehicle.customerKey,
    year: (vehicle.year || '').trim(),
    make: (vehicle.make || '').trim(),
    model: (vehicle.model || '').trim(),
    vin: (vehicle.vin || '').trim(),
    licensePlate: (vehicle.licensePlate || '').trim(),
    mileage: (vehicle.mileage || '').trim(),
    createdAt: now,
  };
}

function listCatalogPresets(): CatalogPreset[] {
  const rows = database
    .prepare(
      'SELECT id, category, shortcut, name, description, part_number, default_price, default_quantity, taxable, created_at FROM catalog_presets ORDER BY category ASC, name ASC',
    )
    .all() as Array<{
    id: string;
    category: string;
    shortcut: string;
    name: string;
    description: string;
    part_number: string;
    default_price: number;
    default_quantity: number;
    taxable: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    category: r.category as any,
    shortcut: r.shortcut,
    name: r.name,
    description: r.description,
    partNumber: r.part_number,
    defaultPrice: Number(r.default_price),
    defaultQuantity: Number(r.default_quantity || 1),
    taxable: Boolean(r.taxable),
    createdAt: r.created_at,
  }));
}

function saveCatalogPreset(preset: Partial<CatalogPreset>): CatalogPreset {
  if (!preset.name?.trim()) throw new Error('Preset name is required.');
  if (!preset.description?.trim())
    throw new Error('Preset description is required.');
  const shortcut = (preset.shortcut || preset.name)
    .toLowerCase()
    .trim()
    .replace(/^\//, '')
    .replace(/[^a-z0-9_-]/g, '-');
  if (!shortcut) throw new Error('A valid shortcut is required.');
  const id = preset.id || randomUUID();
  const now = preset.createdAt || new Date().toISOString();
  database
    .prepare(
      `INSERT INTO catalog_presets (
         id, category, shortcut, name, description, part_number,
         default_price, default_quantity, taxable, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         shortcut = excluded.shortcut,
         name = excluded.name,
         description = excluded.description,
         part_number = excluded.part_number,
         default_price = excluded.default_price,
         default_quantity = excluded.default_quantity,
         taxable = excluded.taxable`,
    )
    .run(
      id,
      preset.category || 'labor',
      shortcut,
      preset.name.trim(),
      preset.description.trim(),
      (preset.partNumber || '').trim(),
      Number(preset.defaultPrice) || 0,
      Number(preset.defaultQuantity) || 1,
      preset.taxable ? 1 : 0,
      now,
    );
  return {
    id,
    category: preset.category || 'labor',
    shortcut,
    name: preset.name.trim(),
    description: preset.description.trim(),
    partNumber: (preset.partNumber || '').trim(),
    defaultPrice: Number(preset.defaultPrice) || 0,
    defaultQuantity: Number(preset.defaultQuantity) || 1,
    taxable: Boolean(preset.taxable),
    createdAt: now,
  };
}

function deleteCatalogPreset(id: string): boolean {
  const res = database
    .prepare('DELETE FROM catalog_presets WHERE id = ?')
    .run(id);
  return res.changes > 0;
}

function resetCatalogPresets(): CatalogPreset[] {
  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec('DELETE FROM catalog_presets;');
    const insert = database.prepare(`
      INSERT INTO catalog_presets (
        id, category, shortcut, name, description, part_number,
        default_price, default_quantity, taxable, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const preset of defaultBodyShopPresets) {
      insert.run(
        randomUUID(),
        preset.category,
        preset.shortcut,
        preset.name,
        preset.description,
        preset.partNumber ?? '',
        preset.defaultPrice,
        preset.defaultQuantity ?? 1,
        preset.taxable ? 1 : 0,
        now,
      );
    }
    database.exec('COMMIT;');
  } catch (err) {
    database.exec('ROLLBACK;');
    throw err;
  }
  return listCatalogPresets();
}

function setWorkOrderStatus(id: string, status: string): WorkOrder {
  if (!ORDER_STATUSES.includes(status as WorkOrderStatus))
    throw new Error('Unknown repair order status.');
  const row = database
    .prepare(
      'SELECT id, order_number, data_json, created_at FROM work_orders WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        order_number: string;
        data_json: string;
        created_at: string;
      }
    | undefined;
  if (!row) throw new Error('Repair order not found.');
  const order = normalizeInput(JSON.parse(row.data_json));
  const updated: WorkOrder = {
    ...order,
    status: status as WorkOrderStatus,
    total: chargeTotals(order).total,
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
  };
  database
    .prepare('UPDATE work_orders SET data_json = ? WHERE id = ?')
    .run(JSON.stringify(updated), id);
  return updated;
}

function validateWorkOrder(input: WorkOrderInput) {
  if (!input.customerName?.trim())
    throw new Error('Customer name is required.');
  const cleanNumber = (val: unknown) => {
    const s = String(val ?? '')
      .trim()
      .replace(/[$,]/g, '');
    return s === '' ? 0 : Number(s);
  };
  const amounts = [
    cleanNumber(input.taxRate),
    ...input.charges.map((line) => cleanNumber(line.unitPrice ?? line.amount)),
    ...input.charges.map((line) => cleanNumber(line.quantity ?? '1')),
    ...(input.revisedCharges ?? []).flatMap((line) => [
      cleanNumber(line.unitPrice ?? line.amount),
      cleanNumber(line.quantity ?? '1'),
    ]),
    cleanNumber(input.legacy?.depositAmount),
  ];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(
      'Amounts, quantities, and the tax rate must be valid, nonnegative numbers.',
    );
  }
}

function saveWorkOrder(input: WorkOrderInput): WorkOrder {
  input = normalizeInput(input);
  input.customerKey = orderCustomerKey(input, listCustomerContacts());
  validateWorkOrder(input);
  const nextNumber =
    (
      database
        .prepare(
          "SELECT value FROM app_settings WHERE key = 'next_order_number'",
        )
        .get() as { value: string } | undefined
    )?.value ?? '1';
  const orderNumber = `RO-${String(Number(nextNumber)).padStart(5, '0')}`;
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const vehicle = [input.vehicleYear, input.vehicleMake, input.vehicleModel]
    .filter(Boolean)
    .join(' ');
  const total = chargeTotals(input).total;
  const order: WorkOrder = { ...input, id, orderNumber, createdAt, total };

  database.exec('BEGIN IMMEDIATE;');
  try {
    database
      .prepare(
        'INSERT INTO work_orders (id, order_number, customer_name, vehicle, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        orderNumber,
        input.customerName.trim(),
        vehicle,
        JSON.stringify(order),
        createdAt,
      );
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('next_order_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(String(Number(nextNumber) + 1));
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('tax_rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run((input.taxRate ?? '').trim());
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
  return order;
}

function updateWorkOrder(id: string, input: WorkOrderInput): WorkOrder {
  const row = database
    .prepare(
      'SELECT id, order_number, data_json, created_at FROM work_orders WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        order_number: string;
        data_json: string;
        created_at: string;
      }
    | undefined;
  if (!row) throw new Error('Repair order not found.');
  const existing = normalizeInput(JSON.parse(row.data_json));
  const normalized = normalizeInput({ ...input, status: existing.status });
  normalized.customerKey = orderCustomerKey(normalized, listCustomerContacts());
  validateWorkOrder(normalized);
  const vehicle = [
    normalized.vehicleYear,
    normalized.vehicleMake,
    normalized.vehicleModel,
  ]
    .filter(Boolean)
    .join(' ');
  const order: WorkOrder = {
    ...normalized,
    total: chargeTotals(normalized).total,
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
  };
  database
    .prepare(
      'UPDATE work_orders SET customer_name = ?, vehicle = ?, data_json = ? WHERE id = ?',
    )
    .run(
      normalized.customerName.trim(),
      vehicle,
      JSON.stringify(order),
      row.id,
    );
  return order;
}

function deleteWorkOrder(id: string): boolean {
  const row = database
    .prepare('SELECT id FROM work_orders WHERE id = ?')
    .get(id);
  if (!row) throw new Error('Repair order not found.');
  database.prepare('DELETE FROM work_orders WHERE id = ?').run(id);
  return true;
}

function readSetting(key: string) {
  return (
    database
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as { value: string } | undefined
  )?.value;
}

function getSettings(): TaxSettings {
  const rawDefaults = readSetting('tax_defaults');
  let defaults = builtInTaxDefaults;
  if (rawDefaults) {
    try {
      defaults = normalizeTaxDefaults(JSON.parse(rawDefaults));
    } catch {
      defaults = builtInTaxDefaults;
    }
  }
  return {
    taxRate: readSetting('tax_rate') ?? '',
    defaults,
    nextOrderNumber: readSetting('next_order_number') ?? '1',
    shopName: readSetting('shop_name') ?? 'Katia Auto Sales & Repairs',
    shopPhone: readSetting('shop_phone') ?? '(630) 907-7198',
    shopAddress:
      readSetting('shop_address') ?? '1005 Rural St, Aurora, IL 60505',
    shopCity: readSetting('shop_city') ?? 'Aurora',
    shopState: readSetting('shop_state') ?? 'IL',
    shopZip: readSetting('shop_zip') ?? '60505',
    defaultTerms: readSetting('shop_terms') ?? 'Balance due at vehicle pickup',
    defaultWrittenBy: readSetting('shop_written_by') ?? '',
    defaultTechnician: readSetting('shop_technician') ?? '',
    defaultCallWhenReady: readSetting('shop_call_when_ready') ?? 'Yes',
    defaultSaveOldParts: readSetting('shop_save_old_parts') ?? 'Yes',
    receiptStyle: normalizeReceiptStyle(readSetting('receipt_style')),
  };
}

function saveSettings(settings: TaxSettings): TaxSettings {
  const taxRate = (settings.taxRate ?? '').trim();
  const rate = Number(taxRate);
  if (taxRate && (!Number.isFinite(rate) || rate < 0)) {
    throw new Error('The sales tax rate must be a nonnegative number.');
  }
  const nextOrderNumber = String(
    Number((settings.nextOrderNumber ?? '').replace(/\D/g, '')) || 1,
  );
  const shopName = (settings.shopName ?? 'Katia Auto Sales & Repairs').trim();
  const shopPhone = (settings.shopPhone ?? '(630) 907-7198').trim();
  const shopAddress = (
    settings.shopAddress ?? '1005 Rural St, Aurora, IL 60505'
  ).trim();
  const shopCity = (settings.shopCity ?? 'Aurora').trim();
  const shopState = (settings.shopState ?? 'IL').trim();
  const shopZip = (settings.shopZip ?? '60505').trim();
  const defaultTerms = (
    settings.defaultTerms ?? 'Balance due at vehicle pickup'
  ).trim();
  const defaultWrittenBy = (settings.defaultWrittenBy ?? '').trim();
  const defaultTechnician = (settings.defaultTechnician ?? '').trim();
  const defaultCallWhenReady = settings.defaultCallWhenReady ?? 'Yes';
  const defaultSaveOldParts = settings.defaultSaveOldParts ?? 'Yes';
  const receiptStyle = normalizeReceiptStyle(settings.receiptStyle);
  const defaults = normalizeTaxDefaults(settings.defaults);

  database.exec('BEGIN IMMEDIATE;');
  try {
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('tax_rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(taxRate);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('tax_defaults', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(defaults));
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('next_order_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(nextOrderNumber);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(shopName);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_phone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(shopPhone);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_address', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(shopAddress);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_city', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(shopCity);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(shopState);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_zip', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(shopZip);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_terms', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(defaultTerms);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_written_by', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(defaultWrittenBy);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_technician', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(defaultTechnician);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_call_when_ready', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(defaultCallWhenReady);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('shop_save_old_parts', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(defaultSaveOldParts);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('receipt_style', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(receiptStyle);
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
  return {
    taxRate,
    defaults,
    nextOrderNumber,
    shopName,
    shopPhone,
    shopAddress,
    shopCity,
    shopState,
    shopZip,
    defaultTerms,
    defaultWrittenBy,
    defaultTechnician,
    defaultCallWhenReady,
    defaultSaveOldParts,
    receiptStyle,
  };
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function seedDemoWorkOrder() {
  if (app.isPackaged) return;
  const count = database
    .prepare('SELECT COUNT(*) AS count FROM work_orders')
    .get() as { count: number };
  if (count.count === 0)
    saveWorkOrder({
      customerName: 'Demo Customer',
      phone: '(630) 555-0142',
      address: '123 Example Ave, Aurora, IL 60505',
      vehicleYear: '2021',
      vehicleMake: 'Honda',
      vehicleModel: 'Accord',
      vin: '1HGBH41JXMN000001',
      licensePlate: 'DEMO-01',
      mileage: '42,180',
      dateIn: localDate(),
      datePromised: localDate(3),
      concerns:
        'DEMO ONLY — Repair a scrape and dent on the rear bumper. Refinish to match and check rear sensors.',
      charges: [
        {
          kind: 'parts',
          quantity: '1',
          unitPrice: '485.00',
          description: 'Rear bumper cover',
          amount: '485.00',
        },
        {
          kind: 'labor',
          quantity: '1',
          unitPrice: '690.00',
          description: 'Refinish and color match',
          amount: '690.00',
        },
        {
          kind: 'labor',
          quantity: '1',
          unitPrice: '245.00',
          description: 'Remove, install, and check sensors',
          amount: '245.00',
        },
        {
          kind: 'other',
          quantity: '1',
          unitPrice: '32.50',
          description: 'Shop supplies',
          amount: '32.50',
        },
      ],
      taxRate: '8.25',
    });

  const fullDemo = database
    .prepare('SELECT 1 FROM work_orders WHERE customer_name = ?')
    .get('Morgan Example (DEMO)');
  if (fullDemo) return;
  saveWorkOrder({
    customerName: 'Morgan Example (DEMO)',
    phone: '(630) 555-0188',
    address: '2450 Sample Parkway',
    vehicleYear: '2022',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry SE',
    vin: '4T1G11AK0NU123456',
    licensePlate: 'EXM-2026',
    mileage: '38,420',
    dateIn: localDate(-1),
    datePromised: localDate(4),
    concerns:
      'DEMO ONLY — Repair front bumper damage, replace grille and right headlamp, blend paint into adjacent panels, recalibrate front sensor.',
    status: 'in_progress',
    charges: [
      {
        kind: 'parts',
        quantity: '1',
        unitPrice: '640.00',
        partNumber: '52119-06C90',
        description: 'Front bumper cover',
        amount: '640.00',
      },
      {
        kind: 'parts',
        quantity: '1',
        unitPrice: '385.00',
        partNumber: '53101-06220',
        description: 'Front grille assembly',
        amount: '385.00',
      },
      {
        kind: 'labor',
        quantity: '5.5',
        unitPrice: '110.00',
        description: 'Remove and install front bumper and components',
        amount: '605.00',
      },
      {
        kind: 'labor',
        quantity: '7',
        unitPrice: '110.00',
        description: 'Refinish bumper and blend adjacent panels',
        amount: '770.00',
      },
      {
        kind: 'labor',
        quantity: '1',
        unitPrice: '145.00',
        description: 'Sensor recalibration and road check',
        amount: '145.00',
      },
      {
        kind: 'sublet',
        quantity: '1',
        unitPrice: '165.00',
        description: 'Pre and post repair scan',
        amount: '165.00',
      },
      {
        kind: 'fluids',
        quantity: '1',
        unitPrice: '28.00',
        description: 'Shop fluids and cleaners',
        amount: '28.00',
      },
      {
        kind: 'disposal',
        quantity: '1',
        unitPrice: '24.00',
        description: 'EPA waste disposal',
        amount: '24.00',
      },
      {
        kind: 'other',
        quantity: '1',
        unitPrice: '42.00',
        description: 'Shop supplies',
        amount: '42.00',
      },
    ],
    revisedCharges: [
      {
        kind: 'parts',
        quantity: '1',
        unitPrice: '720.00',
        partNumber: '81110-06270',
        description: 'Right headlamp assembly',
        amount: '720.00',
      },
      {
        kind: 'labor',
        quantity: '1',
        unitPrice: '310.00',
        description: 'Install right headlamp and aim',
        amount: '310.00',
      },
    ],
    taxRate: '8.25',
    legacy: {
      ...defaultLegacy,
      city: 'Aurora',
      state: 'IL',
      zip: '60505',
      phoneExtension: '204',
      homePhone: '(630) 555-0199',
      customerOrderNumber: 'CUST-78421',
      writtenBy: 'Jamie Example',
      technician: 'Riley Example',
      callWhenReady: 'Yes',
      terms: 'Balance due at vehicle pickup',
      saveOldParts: 'Yes',
      depositAmount: '250.00',
      estimateAuthorizedBy: 'Morgan Example',
      estimateMethod: 'By phone',
      estimateDate: localDate(-1),
      estimateTime: '10:15',
      estimateCalledBy: 'Jamie Example',
      estimatePhone: '(630) 555-0188',
      revisedDescription:
        'Replace damaged right headlamp found during teardown; add headlamp alignment.',
      revisedAuthorizedBy: 'Morgan Example',
      revisedMethod: 'In person',
      revisedDate: localDate(),
      revisedTime: '14:40',
      revisedCalledBy: 'Jamie Example',
      revisedPhone: '(630) 555-0188',
      signature: '',
      signatureDate: '',
    },
  });
}

async function generateOrderPdfBuffer(order: WorkOrder): Promise<Buffer> {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    const shopSettings = getSettings();
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml(order, shopSettings))}`,
    );
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    printWindow.close();
  }
}

async function printWorkOrder(
  order: WorkOrder,
): Promise<{ saved: boolean; filePath?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save repair order as PDF',
    defaultPath: `${order.orderNumber}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { saved: false };
  const pdfBuffer = await generateOrderPdfBuffer(order);
  await fs.writeFile(filePath, pdfBuffer);
  return { saved: true, filePath };
}

async function printOrderDirect(
  order: WorkOrder,
  options?: { isBlank?: boolean; autoPrint?: boolean },
): Promise<{ success: boolean; error?: string }> {
  const isBlank = Boolean(options?.isBlank);
  const autoPrint = options?.autoPrint !== false;
  const shopSettings = getSettings();
  let html = receiptHtml(order, shopSettings, { isBlank });

  const printToolbar = `
    <style>
      @media print {
        .print-preview-bar { display: none !important; }
      }
      .print-preview-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 48px;
        background: #0f172a;
        color: #ffffff;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      .print-preview-bar .title-group {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .print-preview-bar .order-badge {
        font-weight: 700;
        color: #60a5fa;
        font-size: 14px;
      }
      .print-preview-bar .btn-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .print-preview-bar button {
        border: none;
        border-radius: 6px;
        padding: 7px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .print-preview-bar .btn-print {
        background: #2563eb;
        color: #ffffff;
      }
      .print-preview-bar .btn-print:hover {
        background: #1d4ed8;
      }
      .print-preview-bar .btn-close {
        background: rgba(255,255,255,0.12);
        color: #e2e8f0;
      }
      .print-preview-bar .btn-close:hover {
        background: rgba(255,255,255,0.22);
      }
    </style>
    <div class="print-preview-bar">
      <div class="title-group">
        <span class="order-badge">${isBlank ? 'Blank Order Form' : `RO #${order.orderNumber}`}</span>
        <span>${isBlank ? 'Handwritten Intake Sheet · ' : order.customerName ? `${order.customerName} · ` : ''}Print Preview</span>
      </div>
      <div class="btn-group">
        <button class="btn-print" onclick="window.print()">🖨️ Print</button>
        <button class="btn-close" onclick="window.close()">Close</button>
      </div>
    </div>
  `;

  html = html.replace(/<body[^>]*>/i, (match) => `${match}${printToolbar}`);

  const windowTitle = isBlank
    ? 'Print Blank Order · Katia Auto Sales & Repairs'
    : `Print - ${order.orderNumber} · Katia Auto Sales & Repairs`;

  const printWindow = new BrowserWindow({
    width: 980,
    height: 860,
    minWidth: 750,
    minHeight: 500,
    title: windowTitle,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  printWindow.setMenuBarVisibility(false);

  try {
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );

    if (autoPrint) {
      // Launch print dialog directly over the visible window
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
        },
        (success, failureReason) => {
          if (!success && failureReason && failureReason !== 'cancelled') {
            console.warn('Print dialog issue:', failureReason);
          }
        },
      );
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to open print window:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function printBlankOrderDirect(): Promise<{
  success: boolean;
  error?: string;
}> {
  const blankOrder: WorkOrder = {
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
    legacy: defaultLegacy,
  };
  return printOrderDirect(blankOrder, { isBlank: true });
}

function getEmailSettings(): EmailSettings {
  const provider = (readSetting('email_provider') ?? 'resend') as EmailProvider;
  return {
    provider: provider === 'gmail' ? 'gmail' : 'resend',
    senderName:
      readSetting('email_sender_name') ?? 'Katia Auto Sales & Repairs',
    resendApiKey: readSetting('resend_api_key') ?? '',
    resendFromEmail: readSetting('resend_from_email') ?? '',
    gmailUser: readSetting('gmail_user') ?? '',
    gmailAppPassword: readSetting('gmail_app_password') ?? '',
  };
}

function saveEmailSettings(settings: EmailSettings): EmailSettings {
  const provider: EmailProvider =
    settings.provider === 'gmail' ? 'gmail' : 'resend';
  const senderName = (
    settings.senderName ?? 'Katia Auto Sales & Repairs'
  ).trim();
  const resendApiKey = (settings.resendApiKey ?? '').trim();
  const resendFromEmail = (settings.resendFromEmail ?? '').trim();
  const gmailUser = (settings.gmailUser ?? '').trim();
  const gmailAppPassword = (settings.gmailAppPassword ?? '').trim();

  database.exec('BEGIN IMMEDIATE;');
  try {
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('email_provider', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(provider);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('email_sender_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(senderName);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('resend_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(resendApiKey);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('resend_from_email', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(resendFromEmail);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('gmail_user', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(gmailUser);
    database
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('gmail_app_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(gmailAppPassword);
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }

  return {
    provider,
    senderName,
    resendApiKey,
    resendFromEmail,
    gmailUser,
    gmailAppPassword,
  };
}

async function sendResendDelivery(options: {
  apiKey: string;
  fromEmail: string;
  senderName: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  attachments?: Array<{ filename: string; contentBase64: string }>;
}): Promise<{ id: string }> {
  if (!options.apiKey.trim()) {
    throw new Error(
      'Resend API key is missing. Please enter your API key in Settings.',
    );
  }
  if (!options.fromEmail.trim()) {
    throw new Error(
      'Resend sender email is missing. Please enter your sender email in Settings.',
    );
  }
  if (!options.toEmail.trim()) {
    throw new Error('Recipient email address is required.');
  }

  const from = options.senderName.trim()
    ? `${options.senderName.trim()} <${options.fromEmail.trim()}>`
    : options.fromEmail.trim();

  const payload: Record<string, unknown> = {
    from,
    to: [options.toEmail.trim()],
    subject: options.subject,
    html: options.htmlBody,
  };

  if (options.attachments && options.attachments.length > 0) {
    payload.attachments = options.attachments.map((att) => ({
      filename: att.filename,
      content: att.contentBase64,
    }));
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    const errorMsg =
      data.message || `Resend delivery failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return { id: data.id ?? 'resend_ok' };
}

async function sendGmailDelivery(options: {
  gmailUser: string;
  gmailAppPassword: string;
  senderName: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  attachments?: Array<{ filename: string; contentBase64: string }>;
}): Promise<{ messageId: string }> {
  if (!options.gmailUser.trim()) {
    throw new Error(
      'Gmail address is missing. Please enter your Gmail address in Settings.',
    );
  }
  if (!options.gmailAppPassword.trim()) {
    throw new Error(
      'Google App Password is missing. Please enter your 16-character App Password in Settings.',
    );
  }
  if (!options.toEmail.trim()) {
    throw new Error('Recipient email address is required.');
  }

  const cleanedPassword = options.gmailAppPassword.replace(/\s+/g, '');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: options.gmailUser.trim(),
      pass: cleanedPassword,
    },
  });

  const from = options.senderName.trim()
    ? `"${options.senderName.trim()}" <${options.gmailUser.trim()}>`
    : options.gmailUser.trim();

  const mailOptions: SendMailOptions = {
    from,
    to: options.toEmail.trim(),
    subject: options.subject,
    html: options.htmlBody,
  };

  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map((att) => ({
      filename: att.filename,
      content: Buffer.from(att.contentBase64, 'base64'),
    }));
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}

async function dispatchEmail(
  toEmail: string,
  subject: string,
  htmlBody: string,
  attachments?: Array<{ filename: string; contentBase64: string }>,
  customSettings?: EmailSettings,
): Promise<EmailSendResult> {
  const config = customSettings ?? getEmailSettings();

  if (config.provider === 'gmail') {
    const res = await sendGmailDelivery({
      gmailUser: config.gmailUser,
      gmailAppPassword: config.gmailAppPassword,
      senderName: config.senderName,
      toEmail,
      subject,
      htmlBody,
      attachments,
    });
    return {
      success: true,
      message: `Delivered successfully via Gmail (${res.messageId})`,
    };
  } else {
    const res = await sendResendDelivery({
      apiKey: config.resendApiKey,
      fromEmail: config.resendFromEmail,
      senderName: config.senderName,
      toEmail,
      subject,
      htmlBody,
      attachments,
    });
    return {
      success: true,
      message: `Delivered successfully via Resend (${res.id})`,
    };
  }
}

async function sendTestEmail(
  toEmail: string,
  customSettings?: EmailSettings,
): Promise<EmailSendResult> {
  if (!toEmail?.trim()) {
    throw new Error('Please enter a recipient email address for the test.');
  }
  const config = customSettings ?? getEmailSettings();
  const providerLabel =
    config.provider === 'gmail' ? 'Google Gmail (SMTP)' : 'Resend Cloud API';
  const senderFrom =
    config.provider === 'gmail' ? config.gmailUser : config.resendFromEmail;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
      ${buildKatiaEmailBrandHeader({
        shopName: 'KATIA AUTO SALES & REPAIRS',
        subtitle: '1005 Rural St, Aurora, IL 60505 · (630) 907-7198',
      })}
      <div style="padding: 16px 20px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 6px; font-size: 16px; color: #065f46; font-weight: 700;">✓ Email Delivery Test Successful!</h3>
        <p style="margin: 0; font-size: 13px; color: #047857; line-height: 1.5;">
          Your Katia Invoices email delivery pipeline is verified and operational.
        </p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; color: #64748b;">Active Delivery Provider:</td>
            <td style="padding: 5px 0; font-weight: 600; color: #0f172a; text-align: right;">${providerLabel}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #64748b;">Sender Display Name:</td>
            <td style="padding: 5px 0; font-weight: 600; color: #0f172a; text-align: right;">${config.senderName || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #64748b;">Sender Account / Address:</td>
            <td style="padding: 5px 0; font-weight: 600; color: #0f172a; text-align: right;">${senderFrom || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #64748b;">Test Executed At:</td>
            <td style="padding: 5px 0; color: #0f172a; text-align: right;">${new Date().toLocaleString('en-US')}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 16px;">
        You can now deliver repair orders with attached PDF invoices to customers directly from the application.
      </p>
      <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center;">
        Katia Auto Sales & Repairs Desktop Application · Aurora, Illinois
      </div>
    </div>
  `;

  return await dispatchEmail(
    toEmail.trim(),
    'Test Email · Katia Auto Sales & Repairs System',
    html,
    undefined,
    config,
  );
}

async function sendOrderEmail(
  order: WorkOrder,
  recipientEmail: string,
  customMessage?: string,
): Promise<EmailSendResult> {
  if (!recipientEmail?.trim()) {
    throw new Error('Customer recipient email is required.');
  }

  const totals = chargeTotals(order);
  const pdfBuffer = await generateOrderPdfBuffer(order);
  const vehicleName =
    [order.vehicleYear, order.vehicleMake, order.vehicleModel]
      .filter(Boolean)
      .join(' ') || 'Vehicle';

  const defaultNote =
    'Thank you for bringing your vehicle to Katia Auto Sales & Repairs. Attached is the official repair order and itemized estimate for your records.';
  const messageBody = customMessage?.trim() || defaultNote;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
      ${buildKatiaEmailBrandHeader({
        shopName: 'KATIA AUTO SALES & REPAIRS',
        subtitle: '1005 Rural St, Aurora, IL 60505 · Tel: (630) 907-7198',
      })}
      <p style="font-size: 15px; color: #1e293b; margin: 0 0 12px;">
        Hello <strong>${order.customerName}</strong>,
      </p>
      <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        ${messageBody.replace(/\n/g, '<br/>')}
      </p>
      <div style="margin: 20px 0; padding: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Repair Order:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0f172a; text-align: right;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Vehicle:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a; text-align: right;">${vehicleName}</td>
          </tr>
          ${
            order.vin
              ? `<tr><td style="padding: 6px 0; color: #64748b;">VIN:</td><td style="padding: 6px 0; color: #0f172a; text-align: right; font-family: monospace;">${order.vin}</td></tr>`
              : ''
          }
          ${
            order.licensePlate
              ? `<tr><td style="padding: 6px 0; color: #64748b;">License Plate:</td><td style="padding: 6px 0; color: #0f172a; text-align: right;">${order.licensePlate}</td></tr>`
              : ''
          }
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Date In:</td>
            <td style="padding: 6px 0; color: #0f172a; text-align: right;">${order.dateIn}</td>
          </tr>
          ${
            order.datePromised
              ? `<tr><td style="padding: 6px 0; color: #64748b;">Delivery Date:</td><td style="padding: 6px 0; color: #0f172a; text-align: right;">${order.datePromised}</td></tr>`
              : ''
          }
          <tr style="border-top: 1px solid #cbd5e1;">
            <td style="padding: 12px 0 4px; font-weight: 700; font-size: 15px; color: #0f172a;">Total Amount:</td>
            <td style="padding: 12px 0 4px; font-weight: 800; font-size: 18px; color: #2563eb; text-align: right;">$${totals.total.toFixed(2)}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 24px;">
        An official landscape PDF invoice (<strong>${order.orderNumber}.pdf</strong>) is attached with complete line items, shop authorization, warranty terms, and English/Spanish policies.
      </p>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
        Katia Auto Sales & Repairs Inc · 1005 Rural St, Aurora, IL 60505 · (630) 907-7198
      </div>
    </div>
  `;

  return await dispatchEmail(
    recipientEmail.trim(),
    `Repair Order ${order.orderNumber} · Katia Auto Sales & Repairs`,
    html,
    [
      {
        filename: `${order.orderNumber}.pdf`,
        contentBase64: pdfBuffer.toString('base64'),
      },
    ],
  );
}

async function handleSendGmailTestEmail(
  recipientEmail: string,
): Promise<{ success: boolean; messageId: string; senderEmail: string }> {
  const shopSettings = getSettings();
  const shopName = shopSettings.shopName || 'Katia Auto Sales & Repairs';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
      ${buildKatiaEmailBrandHeader({
        shopName: shopName.toUpperCase(),
        subtitle: 'Gmail API OAuth 2.0 Integration Test',
      })}
      <div style="padding: 16px 20px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 6px; font-size: 16px; color: #065f46; font-weight: 700;">✓ Gmail OAuth 2.0 Connected Successfully!</h3>
        <p style="margin: 0; font-size: 13px; color: #047857; line-height: 1.5;">
          This test message confirms that your desktop application is authenticated with Google and can send customer invoices through the official Gmail REST API.
        </p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 13px;">
        <p style="margin: 0 0 6px; color: #64748b;"><strong>Sent At:</strong> ${new Date().toLocaleString('en-US')}</p>
        <p style="margin: 0; color: #64748b;"><strong>Active Scope:</strong> https://www.googleapis.com/auth/gmail.send</p>
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0;">
        You can now deliver repair order PDFs to customers directly from your connected Gmail address.
      </p>
    </div>
  `;

  return await sendEmailViaGmailApi(
    {
      toEmail: recipientEmail.trim(),
      subject: `Gmail API Test · ${shopName}`,
      htmlBody: html,
      senderName: shopName,
    },
    database,
  );
}

async function handleSendGmailOrderEmail(options: {
  orderId: string;
  recipient: string;
  subject: string;
  personalNote?: string;
}): Promise<{ success: boolean; messageId: string; senderEmail: string }> {
  const row = database
    .prepare(
      'SELECT id, order_number, data_json, created_at FROM work_orders WHERE id = ?',
    )
    .get(options.orderId) as
    | {
        id: string;
        order_number: string;
        data_json: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    throw new Error('Repair order not found.');
  }

  const order = normalizeInput(JSON.parse(row.data_json));
  const fullOrder: WorkOrder = {
    ...order,
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    total: chargeTotals(order).total,
  };

  const pdfBuffer = await generateOrderPdfBuffer(fullOrder);
  const shopSettings = getSettings();
  const shopName = shopSettings.shopName || 'Katia Auto Sales & Repairs';
  const totals = chargeTotals(fullOrder);
  const vehicleName =
    [fullOrder.vehicleYear, fullOrder.vehicleMake, fullOrder.vehicleModel]
      .filter(Boolean)
      .join(' ') || 'Vehicle';

  const defaultNote =
    'Thank you for your business. Attached please find your official repair order and invoice for your records.';
  const note = options.personalNote?.trim() || defaultNote;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
      ${buildKatiaEmailBrandHeader({
        shopName: shopName.toUpperCase(),
        subtitle: `${shopSettings.shopAddress || '1005 Rural St, Aurora, IL 60505'} · Tel: ${shopSettings.shopPhone || '(630) 907-7198'}`,
      })}
      <p style="font-size: 15px; color: #1e293b; margin: 0 0 12px;">
        Hello <strong>${fullOrder.customerName}</strong>,
      </p>
      <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        ${note.replace(/\n/g, '<br/>')}
      </p>
      <div style="margin: 20px 0; padding: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Repair Order:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0f172a; text-align: right;">${fullOrder.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Vehicle:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a; text-align: right;">${vehicleName}</td>
          </tr>
          ${
            fullOrder.vin
              ? `<tr><td style="padding: 6px 0; color: #64748b;">VIN:</td><td style="padding: 6px 0; color: #0f172a; text-align: right; font-family: monospace;">${fullOrder.vin}</td></tr>`
              : ''
          }
          ${
            fullOrder.licensePlate
              ? `<tr><td style="padding: 6px 0; color: #64748b;">License Plate:</td><td style="padding: 6px 0; color: #0f172a; text-align: right;">${fullOrder.licensePlate}</td></tr>`
              : ''
          }
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Date In:</td>
            <td style="padding: 6px 0; color: #0f172a; text-align: right;">${fullOrder.dateIn}</td>
          </tr>
          <tr style="border-top: 1px solid #cbd5e1;">
            <td style="padding: 12px 0 4px; font-weight: 700; font-size: 15px; color: #0f172a;">Total Amount:</td>
            <td style="padding: 12px 0 4px; font-weight: 800; font-size: 18px; color: #2563eb; text-align: right;">$${totals.total.toFixed(2)}</td>
          </tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 24px;">
        An official landscape PDF copy (<strong>${fullOrder.orderNumber}.pdf</strong>) is attached with complete line items, warranty terms, and shop policies.
      </p>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
        ${shopName} · Official Invoice Delivery via Gmail
      </div>
    </div>
  `;

  const plainText = `
${shopName.toUpperCase()}
${shopSettings.shopAddress || '1005 Rural St, Aurora, IL 60505'} | Tel: ${shopSettings.shopPhone || '(630) 907-7198'}

Hello ${fullOrder.customerName},

${note}

Invoice Summary:
- Repair Order: ${fullOrder.orderNumber}
- Vehicle: ${vehicleName}
${fullOrder.vin ? `- VIN: ${fullOrder.vin}\n` : ''}${fullOrder.licensePlate ? `- License Plate: ${fullOrder.licensePlate}\n` : ''}- Date In: ${fullOrder.dateIn}
- Total Amount: $${totals.total.toFixed(2)}

An official PDF copy (${fullOrder.orderNumber}.pdf) is attached to this email.

Thank you for choosing ${shopName}!
  `.trim();

  // Send via Gmail REST API
  const result = await sendEmailViaGmailApi(
    {
      toEmail: options.recipient.trim(),
      toName: fullOrder.customerName,
      subject: options.subject.trim(),
      htmlBody: html,
      textBody: plainText,
      senderName: shopName,
      attachments: [
        {
          filename: `${fullOrder.orderNumber}.pdf`,
          contentType: 'application/pdf',
          data: pdfBuffer,
        },
      ],
    },
    database,
  );

  // Update work order with email delivery metadata (preserving order status)
  const deliveryRecord: EmailDeliveryMetadata = {
    recipient: options.recipient.trim(),
    sentAt: new Date().toISOString(),
    messageId: result.messageId,
    subject: options.subject.trim(),
    senderEmail: result.senderEmail,
  };

  const updatedOrder: WorkOrder = {
    ...fullOrder,
    lastEmailSent: deliveryRecord,
  };

  database
    .prepare('UPDATE work_orders SET data_json = ? WHERE id = ?')
    .run(JSON.stringify(updatedOrder), fullOrder.id);

  return {
    success: true,
    messageId: result.messageId,
    senderEmail: result.senderEmail,
  };
}

async function exportBackupJson(): Promise<boolean> {
  const defaultFileName = `katia-backup-${localDate()}.json`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Katia Body Shop database backup',
    defaultPath: defaultFileName,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  const backupData = buildBackupPayload(database);
  await fs.writeFile(filePath, JSON.stringify(backupData, null, 2), 'utf8');
  return true;
}

async function exportBackupSqlite(): Promise<boolean> {
  const defaultFileName = `katia-body-shop-${localDate()}.sqlite`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export SQLite Database File',
    defaultPath: defaultFileName,
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
  });
  if (canceled || !filePath) return false;
  await exportSqliteSnapshot(database, filePath, databaseFilePath);
  return true;
}

async function importBackup(
  mode: BackupImportMode = 'merge',
): Promise<BackupImportResult> {
  const safeMode: BackupImportMode = mode === 'replace' ? 'replace' : 'merge';
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import / Restore Katia Body Shop Backup',
    properties: ['openFile'],
    filters: [
      {
        name: 'Katia Backups & Databases (.json, .sqlite, .db)',
        extensions: ['json', 'sqlite', 'sqlite3', 'db'],
      },
      { name: 'JSON Backup (.json)', extensions: ['json'] },
      {
        name: 'SQLite Database (.sqlite, .db)',
        extensions: ['sqlite', 'sqlite3', 'db'],
      },
    ],
  });
  if (canceled || !filePaths.length || !filePaths[0]) {
    return {
      canceled: true,
      mode: safeMode,
      ordersAdded: 0,
      ordersUpdated: 0,
      contactsSaved: 0,
      settingsRestored: false,
      totalOrders: 0,
      totalContacts: 0,
    };
  }
  const result = await restoreBackupFromFile(
    database,
    filePaths[0],
    safeMode,
    databaseFilePath,
  );
  return {
    canceled: false,
    ...result,
  };
}

async function exportOrdersCsv(): Promise<boolean> {
  const defaultFileName = `katia-orders-${localDate()}.csv`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export repair orders to CSV',
    defaultPath: defaultFileName,
    filters: [{ name: 'CSV File', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return false;
  const orders = listWorkOrders();
  const escapeCsv = (str: unknown) => {
    const s = String(str ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const headers = [
    'Order Number',
    'Status',
    'Date In',
    'Delivery Date',
    'Customer Name',
    'Phone',
    'Address',
    'Vehicle Year',
    'Vehicle Make',
    'Vehicle Model',
    'VIN',
    'License Plate',
    'Mileage',
    'Parts Total',
    'Labor Total',
    'Other Total',
    'Tax',
    'Total Estimate',
    'Created At',
  ];
  const rows = orders.map((order) => {
    const totals = chargeTotals(order);
    return [
      escapeCsv(order.orderNumber),
      escapeCsv(orderStatusLabels[normalizeStatus(order.status)]),
      escapeCsv(order.dateIn),
      escapeCsv(order.datePromised),
      escapeCsv(order.customerName),
      escapeCsv(order.phone),
      escapeCsv(order.address),
      escapeCsv(order.vehicleYear),
      escapeCsv(order.vehicleMake),
      escapeCsv(order.vehicleModel),
      escapeCsv(order.vin),
      escapeCsv(order.licensePlate),
      escapeCsv(order.mileage),
      escapeCsv(totals.parts.toFixed(2)),
      escapeCsv(totals.labor.toFixed(2)),
      escapeCsv(otherChargesTotal(totals).toFixed(2)),
      escapeCsv(totals.tax.toFixed(2)),
      escapeCsv(totals.total.toFixed(2)),
      escapeCsv(order.createdAt),
    ].join(',');
  });
  const csvContent = [headers.join(','), ...rows].join('\r\n');
  await fs.writeFile(filePath, csvContent, 'utf8');
  return true;
}

if (started) app.quit();

if (process.platform === 'win32') {
  app.setAppUserModelId('com.katia.bodyshop');
}

if (app.isPackaged) {
  try {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: 'izzy2030/katia-invoices',
      },
      updateInterval: '1 hour',
      logger: console,
    });
  } catch (error) {
    console.error('Failed to initialize auto-updater:', error);
  }
}

function getAppIconPath(): string | undefined {
  const isWin = process.platform === 'win32';
  const primaryName = isWin ? 'icon.ico' : 'icon.png';
  const fallbackName = isWin ? 'icon.png' : 'icon.ico';
  const candidates = [
    path.join(__dirname, `../../assets/${primaryName}`),
    path.join(__dirname, `../../assets/${fallbackName}`),
    path.join(process.resourcesPath, `assets/${primaryName}`),
    path.join(process.resourcesPath, `assets/${fallbackName}`),
    path.join(process.resourcesPath, primaryName),
    path.join(process.resourcesPath, fallbackName),
    path.join(app.getAppPath(), `assets/${primaryName}`),
    path.join(app.getAppPath(), `assets/${fallbackName}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function createWindow() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const appIcon = getAppIconPath();

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#ffffff',
    title: 'Katia Body Shop',
    icon: appIcon,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : isWin ? 'hidden' : 'default',
    ...(isWin
      ? {
          titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#0f172a',
            height: 38,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app
  .whenReady()
  .then(() => {
    initializeDatabase();
    seedDemoWorkOrder();
    ipcMain.handle('window:minimize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.minimize();
      return true;
    });
    ipcMain.handle('window:toggle-maximize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return false;
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      return win.isMaximized();
    });
    ipcMain.handle('window:close', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.close();
      return true;
    });
    ipcMain.handle('window:is-maximized', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return win?.isMaximized() ?? false;
    });
    ipcMain.handle(
      'window:set-title-bar-overlay',
      (
        event,
        options: { color: string; symbolColor: string; height?: number },
      ) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && process.platform === 'win32') {
          win.setTitleBarOverlay?.({
            color: options.color,
            symbolColor: options.symbolColor,
            height: options.height ?? 38,
          });
        }
        return true;
      },
    );
    ipcMain.handle('work-orders:list', () => listWorkOrders());
    ipcMain.handle('customer-contacts:list', () => listCustomerContacts());
    ipcMain.handle(
      'customer-contacts:save',
      (_event, contact: CustomerContact) => saveCustomerContact(contact),
    );
    ipcMain.handle('customer-vehicles:list', () => listCustomerVehicles());
    ipcMain.handle('customer-vehicles:save', (_event, vehicle) =>
      saveCustomerVehicle(vehicle),
    );
    ipcMain.handle('catalog:list', () => listCatalogPresets());
    ipcMain.handle('catalog:save', (_event, preset: Partial<CatalogPreset>) =>
      saveCatalogPreset(preset),
    );
    ipcMain.handle('catalog:delete', (_event, id: string) =>
      deleteCatalogPreset(id),
    );
    ipcMain.handle('catalog:reset-defaults', () => resetCatalogPresets());
    ipcMain.handle('work-orders:create', (_event, input: WorkOrderInput) =>
      saveWorkOrder(input),
    );
    ipcMain.handle(
      'work-orders:update',
      (_event, id: string, input: WorkOrderInput) => updateWorkOrder(id, input),
    );
    ipcMain.handle('work-orders:delete', (_event, id: string) =>
      deleteWorkOrder(id),
    );
    ipcMain.handle(
      'work-orders:set-status',
      (_event, id: string, status: string) => setWorkOrderStatus(id, status),
    );
    ipcMain.handle('work-orders:print-pdf', (_event, order: WorkOrder) =>
      printWorkOrder(order),
    );
    ipcMain.handle(
      'work-orders:print',
      (
        _event,
        order: WorkOrder,
        options?: { isBlank?: boolean; autoPrint?: boolean },
      ) => printOrderDirect(order, options),
    );
    ipcMain.handle('work-orders:print-blank', () => printBlankOrderDirect());
    ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
      if (typeof targetPath === 'string' && targetPath.trim()) {
        await shell.openPath(targetPath);
        return true;
      }
      return false;
    });
    ipcMain.handle('backup:export-json', () => exportBackupJson());
    ipcMain.handle('backup:export-sqlite', () => exportBackupSqlite());
    ipcMain.handle('backup:import', (_event, mode?: BackupImportMode) =>
      importBackup(mode),
    );
    ipcMain.handle('backup:get-db-info', () => ({
      dbPath: databaseFilePath,
      dbFileName: path.basename(databaseFilePath),
      dbFolder: path.dirname(databaseFilePath),
    }));
    ipcMain.handle('backup:export-csv', () => exportOrdersCsv());
    ipcMain.handle('dashboard:get', () => {
      const raw = readSetting('dashboard_preferences');
      return normalizeDashboardPreferences(raw ? JSON.parse(raw) : null);
    });
    ipcMain.handle('dashboard:save', (_event, input: DashboardPreferences) => {
      const saved = normalizeDashboardPreferences(input);
      database
        .prepare(
          "INSERT INTO app_settings (key, value) VALUES ('dashboard_preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(JSON.stringify(saved));
      return saved;
    });
    ipcMain.handle('settings:get', () => getSettings());
    ipcMain.handle('settings:save', (_event, settings: TaxSettings) =>
      saveSettings(settings),
    );
    ipcMain.handle('email-settings:get', () => getEmailSettings());
    ipcMain.handle('email-settings:save', (_event, settings: EmailSettings) =>
      saveEmailSettings(settings),
    );
    ipcMain.handle(
      'email:send-test',
      (_event, recipientEmail: string, settings?: EmailSettings) =>
        sendTestEmail(recipientEmail, settings),
    );
    ipcMain.handle(
      'email:send-order-pdf',
      (
        _event,
        order: WorkOrder,
        recipientEmail: string,
        customMessage?: string,
      ) => sendOrderEmail(order, recipientEmail, customMessage),
    );
    // Official Gmail REST API & OAuth 2.0 PKCE handlers
    ipcMain.handle('gmail:status', () => getGmailStatus(database));
    ipcMain.handle(
      'gmail:connect',
      (_event, credentials?: GoogleOAuthCredentials) =>
        connectGmailAccount(database, credentials),
    );
    ipcMain.handle('gmail:disconnect', () => disconnectGmailAccount(database));
    ipcMain.handle(
      'gmail:save-credentials',
      (_event, credentials: GoogleOAuthCredentials) => {
        saveGoogleOAuthCredentials(credentials, database);
        return true;
      },
    );
    ipcMain.handle('gmail:send-test', (_event, recipientEmail: string) =>
      handleSendGmailTestEmail(recipientEmail),
    );
    ipcMain.handle(
      'gmail:send-order',
      (
        _event,
        options: {
          orderId: string;
          recipient: string;
          subject: string;
          personalNote?: string;
        },
      ) => handleSendGmailOrderEmail(options),
    );
    ipcMain.handle('app:version', () => app.getVersion());
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Katia Body Shop could not start:', error);
    dialog.showErrorBox('Katia Body Shop could not start', message);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
