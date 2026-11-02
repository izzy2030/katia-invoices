import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  customerKey,
  orderCustomerKey,
  type CustomerContact,
} from './customerHistory';
import {
  builtInTaxDefaults,
  chargeTotals,
  normalizeDashboardPreferences,
  normalizeInput,
  normalizeStatus,
  normalizeReceiptStyle,
  normalizeTaxDefaults,
  type DashboardPreferences,
  type TaxSettings,
  type WorkOrder,
  type WorkOrderInput,
} from './workOrder';

export type BackupImportMode = 'merge' | 'replace';

export interface BackupPayload {
  version: number;
  exportedAt: string;
  workOrders: WorkOrder[];
  customerContacts: CustomerContact[];
  settings?: TaxSettings;
  dashboardPreferences?: DashboardPreferences;
}

export interface BackupImportResult {
  canceled: boolean;
  mode: BackupImportMode;
  sourceFormat?: 'json' | 'sqlite';
  fileName?: string;
  ordersAdded: number;
  ordersUpdated: number;
  contactsSaved: number;
  settingsRestored: boolean;
  totalOrders: number;
  totalContacts: number;
}

export function ensureBackupSchema(database: DatabaseSync): void {
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
  const orderColumns = database
    .prepare('PRAGMA table_info(work_orders)')
    .all() as Array<{ name: string }>;
  if (!orderColumns.some((column) => column.name === 'status')) {
    database.exec(
      "ALTER TABLE work_orders ADD COLUMN status TEXT NOT NULL DEFAULT 'Open'",
    );
  }
  const contactColumns = database
    .prepare('PRAGMA table_info(customer_contacts)')
    .all() as Array<{ name: string }>;
  if (!contactColumns.some((column) => column.name === 'name')) {
    database.exec(
      "ALTER TABLE customer_contacts ADD COLUMN name TEXT NOT NULL DEFAULT ''",
    );
  }
  if (!contactColumns.some((column) => column.name === 'email')) {
    database.exec(
      "ALTER TABLE customer_contacts ADD COLUMN email TEXT NOT NULL DEFAULT ''",
    );
  }
}

function readSettingFromDb(
  database: DatabaseSync,
  key: string,
): string | undefined {
  return (
    database
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as { value: string } | undefined
  )?.value;
}

function upsertSettingInDb(
  database: DatabaseSync,
  key: string,
  value: string,
): void {
  database
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function listWorkOrdersFromDb(database: DatabaseSync): WorkOrder[] {
  const orderColumns = database
    .prepare('PRAGMA table_info(work_orders)')
    .all() as Array<{ name: string }>;
  const hasStatus = orderColumns.some((c) => c.name === 'status');
  const query = `SELECT id, order_number, ${hasStatus ? 'status' : "'open' AS status"}, data_json, created_at FROM work_orders ORDER BY created_at DESC`;
  const rows = database.prepare(query).all() as Array<{
    id: string;
    order_number: string;
    status?: string;
    data_json: string;
    created_at: string;
  }>;
  return rows.map((row, idx) => {
    let parsed: WorkOrderInput;
    try {
      parsed = JSON.parse(row.data_json) as WorkOrderInput;
    } catch {
      throw new Error(
        `Database contains corrupt JSON for repair order ${row.order_number || idx}.`,
      );
    }
    const order = normalizeInput({
      ...parsed,
      status: parsed.status ?? (row.status as WorkOrderInput['status']),
    });
    return {
      ...order,
      total: chargeTotals(order).total,
      id: row.id,
      orderNumber: row.order_number,
      createdAt: row.created_at,
    };
  });
}

export function listCustomerContactsFromDb(
  database: DatabaseSync,
): CustomerContact[] {
  const contactColumns = database
    .prepare('PRAGMA table_info(customer_contacts)')
    .all() as Array<{ name: string }>;
  const hasName = contactColumns.some((c) => c.name === 'name');
  const hasEmail = contactColumns.some((c) => c.name === 'email');

  const query = `SELECT customer_key, ${hasName ? 'name' : "'' AS name"}, phone, address, ${hasEmail ? 'email' : "'' AS email"} FROM customer_contacts ORDER BY customer_key`;
  const rows = database.prepare(query).all() as Array<{
    customer_key: string;
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  }>;
  return rows.map((row) => ({
    key: row.customer_key,
    name: row.name ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    email: row.email ?? '',
  }));
}

export function getSettingsFromDb(database: DatabaseSync): TaxSettings {
  const rawDefaults = readSettingFromDb(database, 'tax_defaults');
  let defaults = builtInTaxDefaults;
  if (rawDefaults) {
    try {
      defaults = normalizeTaxDefaults(JSON.parse(rawDefaults));
    } catch {
      defaults = builtInTaxDefaults;
    }
  }
  return {
    taxRate: readSettingFromDb(database, 'tax_rate') ?? '',
    defaults,
    nextOrderNumber: readSettingFromDb(database, 'next_order_number') ?? '1',
    shopName:
      readSettingFromDb(database, 'shop_name') ?? 'Katia Auto Sales & Repairs',
    shopPhone: readSettingFromDb(database, 'shop_phone') ?? '(630) 907-7198',
    shopAddress:
      readSettingFromDb(database, 'shop_address') ??
      '1005 Rural St, Aurora, IL 60505',
    shopCity: readSettingFromDb(database, 'shop_city') ?? 'Aurora',
    shopState: readSettingFromDb(database, 'shop_state') ?? 'IL',
    shopZip: readSettingFromDb(database, 'shop_zip') ?? '60505',
    defaultTerms:
      readSettingFromDb(database, 'shop_terms') ??
      'Balance due at vehicle pickup',
    defaultWrittenBy: readSettingFromDb(database, 'shop_written_by') ?? '',
    defaultTechnician: readSettingFromDb(database, 'shop_technician') ?? '',
    defaultCallWhenReady:
      readSettingFromDb(database, 'shop_call_when_ready') ?? 'Yes',
    defaultSaveOldParts:
      readSettingFromDb(database, 'shop_save_old_parts') ?? 'Yes',
    receiptStyle: normalizeReceiptStyle(
      readSettingFromDb(database, 'receipt_style'),
    ),
  };
}

export function getDashboardPreferencesFromDb(
  database: DatabaseSync,
): DashboardPreferences {
  const raw = readSettingFromDb(database, 'dashboard_preferences');
  if (!raw) return normalizeDashboardPreferences(null);
  try {
    return normalizeDashboardPreferences(JSON.parse(raw));
  } catch {
    return normalizeDashboardPreferences(null);
  }
}

export function buildBackupPayload(database: DatabaseSync): BackupPayload {
  ensureBackupSchema(database);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workOrders: listWorkOrdersFromDb(database),
    customerContacts: listCustomerContactsFromDb(database),
    settings: getSettingsFromDb(database),
    dashboardPreferences: getDashboardPreferencesFromDb(database),
  };
}

function validateBackupWorkOrderAmounts(input: WorkOrderInput): void {
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
      'Backup contains a repair order with invalid or negative amounts.',
    );
  }
}

export function parseBackupJson(rawText: string): BackupPayload {
  const cleaned = String(rawText ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!cleaned) {
    throw new Error('Invalid backup file: file is empty.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Invalid backup file: could not parse JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid backup file: root value must be a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.version !== undefined &&
    (typeof record.version !== 'number' ||
      !Number.isFinite(record.version) ||
      record.version < 1 ||
      record.version > 10)
  ) {
    throw new Error('Unsupported backup file version.');
  }

  const hasWorkOrders = record.workOrders !== undefined;
  const hasContacts = record.customerContacts !== undefined;
  const hasSettings = record.settings !== undefined && record.settings !== null;

  if (!hasWorkOrders && !hasContacts && !hasSettings) {
    throw new Error(
      'Invalid backup file: missing workOrders, customerContacts, or settings data.',
    );
  }
  if (hasWorkOrders && !Array.isArray(record.workOrders)) {
    throw new Error('Invalid backup file: "workOrders" must be an array.');
  }
  if (hasContacts && !Array.isArray(record.customerContacts)) {
    throw new Error(
      'Invalid backup file: "customerContacts" must be an array.',
    );
  }
  if (
    hasSettings &&
    (typeof record.settings !== 'object' || Array.isArray(record.settings))
  ) {
    throw new Error('Invalid backup file: "settings" must be an object.');
  }

  return {
    version: typeof record.version === 'number' ? record.version : 1,
    exportedAt:
      typeof record.exportedAt === 'string'
        ? record.exportedAt
        : new Date().toISOString(),
    workOrders: (record.workOrders as WorkOrder[] | undefined) ?? [],
    customerContacts:
      (record.customerContacts as CustomerContact[] | undefined) ?? [],
    settings: hasSettings ? (record.settings as TaxSettings) : undefined,
    dashboardPreferences:
      record.dashboardPreferences &&
      typeof record.dashboardPreferences === 'object'
        ? normalizeDashboardPreferences(
            record.dashboardPreferences as Partial<DashboardPreferences>,
          )
        : undefined,
  };
}

export function extractBackupPayloadFromSqlite(
  sqliteFilePath: string,
): BackupPayload {
  const extDb = new DatabaseSync(sqliteFilePath, { readOnly: true });
  try {
    const tables = extDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('work_orders', 'customer_contacts', 'app_settings')",
      )
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    if (tableNames.size === 0) {
      throw new Error(
        'Selected SQLite file does not contain Katia Body Shop tables.',
      );
    }

    const workOrders = tableNames.has('work_orders')
      ? listWorkOrdersFromDb(extDb)
      : [];
    const customerContacts = tableNames.has('customer_contacts')
      ? listCustomerContactsFromDb(extDb)
      : [];
    const settings = tableNames.has('app_settings')
      ? getSettingsFromDb(extDb)
      : undefined;
    const dashboardPreferences = tableNames.has('app_settings')
      ? getDashboardPreferencesFromDb(extDb)
      : undefined;

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      workOrders,
      customerContacts,
      settings,
      dashboardPreferences,
    };
  } finally {
    extDb.close();
  }
}

function extractOrderSequence(orderNumber: string): number {
  const trimmed = String(orderNumber ?? '').trim();
  const roMatch = /^RO-0*(\d+)$/i.exec(trimmed);
  if (roMatch) {
    const n = Number(roMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const digitsMatch = /(\d+)/.exec(trimmed);
  if (digitsMatch) {
    const n = Number(digitsMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function formatOrderSequence(seq: number): string {
  return `RO-${String(Math.max(1, Math.floor(seq))).padStart(5, '0')}`;
}

export function writeSettingsToDb(
  database: DatabaseSync,
  settings: Partial<TaxSettings>,
): void {
  const taxRate = String(settings.taxRate ?? '').trim();
  const rate = Number(taxRate);
  if (taxRate && (!Number.isFinite(rate) || rate < 0)) {
    throw new Error(
      'The sales tax rate in backup must be a nonnegative number.',
    );
  }
  const nextOrderNumber = String(
    Number(String(settings.nextOrderNumber ?? '').replace(/\D/g, '')) || 1,
  );
  const shopName = String(
    settings.shopName ?? 'Katia Auto Sales & Repairs',
  ).trim();
  const shopPhone = String(settings.shopPhone ?? '(630) 907-7198').trim();
  const shopAddress = String(
    settings.shopAddress ?? '1005 Rural St, Aurora, IL 60505',
  ).trim();
  const shopCity = String(settings.shopCity ?? 'Aurora').trim();
  const shopState = String(settings.shopState ?? 'IL').trim();
  const shopZip = String(settings.shopZip ?? '60505').trim();
  const defaultTerms = String(
    settings.defaultTerms ?? 'Balance due at vehicle pickup',
  ).trim();
  const defaultWrittenBy = String(settings.defaultWrittenBy ?? '').trim();
  const defaultTechnician = String(settings.defaultTechnician ?? '').trim();
  const defaultCallWhenReady = String(settings.defaultCallWhenReady ?? 'Yes');
  const defaultSaveOldParts = String(settings.defaultSaveOldParts ?? 'Yes');
  const defaults = normalizeTaxDefaults(settings.defaults);

  upsertSettingInDb(database, 'tax_rate', taxRate);
  upsertSettingInDb(database, 'tax_defaults', JSON.stringify(defaults));
  upsertSettingInDb(database, 'next_order_number', nextOrderNumber);
  upsertSettingInDb(database, 'shop_name', shopName);
  upsertSettingInDb(database, 'shop_phone', shopPhone);
  upsertSettingInDb(database, 'shop_address', shopAddress);
  upsertSettingInDb(database, 'shop_city', shopCity);
  upsertSettingInDb(database, 'shop_state', shopState);
  upsertSettingInDb(database, 'shop_zip', shopZip);
  upsertSettingInDb(database, 'shop_terms', defaultTerms);
  upsertSettingInDb(database, 'shop_written_by', defaultWrittenBy);
  upsertSettingInDb(database, 'shop_technician', defaultTechnician);
  upsertSettingInDb(database, 'shop_call_when_ready', defaultCallWhenReady);
  upsertSettingInDb(database, 'shop_save_old_parts', defaultSaveOldParts);
  upsertSettingInDb(
    database,
    'receipt_style',
    normalizeReceiptStyle(settings.receiptStyle),
  );
}

function isAutoSeededDemoCustomer(name: string): boolean {
  const trimmed = String(name ?? '').trim();
  return trimmed === 'Demo Customer' || trimmed === 'Morgan Example (DEMO)';
}

export function importBackupPayload(
  database: DatabaseSync,
  payload: BackupPayload,
  mode: BackupImportMode = 'merge',
): Omit<BackupImportResult, 'canceled' | 'sourceFormat' | 'fileName'> {
  if (mode !== 'merge' && mode !== 'replace') {
    throw new Error(`Unsupported backup import mode: ${String(mode)}`);
  }
  ensureBackupSchema(database);

  const rawOrders = Array.isArray(payload.workOrders) ? payload.workOrders : [];
  const rawContacts = Array.isArray(payload.customerContacts)
    ? payload.customerContacts
    : [];

  // Pre-validate all incoming orders before starting the write transaction
  const preparedOrders = rawOrders.map((rawItem, idx) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new Error(`Invalid repair order at index ${idx} in backup.`);
    }
    const rawRecord = rawItem as unknown as Record<string, unknown>;
    let baseData: WorkOrderInput;
    if (typeof rawRecord.data_json === 'string') {
      try {
        baseData = JSON.parse(rawRecord.data_json) as WorkOrderInput;
      } catch {
        throw new Error(`Invalid repair order JSON at index ${idx} in backup.`);
      }
    } else {
      baseData = rawItem as WorkOrderInput;
    }
    if (!baseData || typeof baseData !== 'object' || Array.isArray(baseData)) {
      throw new Error(`Invalid repair order data at index ${idx} in backup.`);
    }
    if (baseData.charges !== undefined && !Array.isArray(baseData.charges)) {
      throw new Error(
        `Invalid repair order at index ${idx} in backup: "charges" must be an array.`,
      );
    }
    if (
      baseData.revisedCharges !== undefined &&
      !Array.isArray(baseData.revisedCharges)
    ) {
      throw new Error(
        `Invalid repair order at index ${idx} in backup: "revisedCharges" must be an array.`,
      );
    }
    const fallbackName =
      typeof rawRecord.customer_name === 'string'
        ? rawRecord.customer_name
        : '';
    const normalized = normalizeInput({
      ...baseData,
      charges: Array.isArray(baseData.charges) ? baseData.charges : [],
      customerName: baseData.customerName || fallbackName,
    });
    if (!normalized.customerName.trim()) {
      throw new Error(
        `Repair order at index ${idx} in backup is missing a customer name.`,
      );
    }
    validateBackupWorkOrderAmounts(normalized);

    const hadExplicitId =
      typeof rawRecord.id === 'string' && Boolean(rawRecord.id.trim());
    const id = hadExplicitId ? (rawRecord.id as string).trim() : randomUUID();
    const orderNumber =
      typeof rawRecord.orderNumber === 'string' && rawRecord.orderNumber.trim()
        ? rawRecord.orderNumber.trim()
        : typeof rawRecord.order_number === 'string' &&
            rawRecord.order_number.trim()
          ? rawRecord.order_number.trim()
          : '';
    const createdAt =
      typeof rawRecord.createdAt === 'string' && rawRecord.createdAt.trim()
        ? rawRecord.createdAt.trim()
        : typeof rawRecord.created_at === 'string' &&
            rawRecord.created_at.trim()
          ? rawRecord.created_at.trim()
          : new Date().toISOString();

    return {
      id,
      hadExplicitId,
      orderNumber,
      createdAt,
      normalized,
    };
  });

  let ordersAdded = 0;
  let ordersUpdated = 0;
  let contactsSaved = 0;
  let settingsRestored = false;

  const existingNextOrderSetting =
    Number(
      String(readSettingFromDb(database, 'next_order_number') ?? '1').replace(
        /\D/g,
        '',
      ),
    ) || 1;

  database.exec('BEGIN IMMEDIATE;');
  try {
    if (mode === 'replace') {
      database.exec('DELETE FROM work_orders;');
      database.exec('DELETE FROM customer_contacts;');
    }

    // 1. Upsert customer contacts
    for (const rawContact of rawContacts) {
      if (
        !rawContact ||
        typeof rawContact !== 'object' ||
        Array.isArray(rawContact)
      ) {
        continue;
      }
      const contactRecord = rawContact as unknown as Record<string, unknown>;
      const name = String(contactRecord.name ?? '').trim();
      const phone = String(contactRecord.phone ?? '').trim();
      const address = String(contactRecord.address ?? '').trim();
      const email = String(contactRecord.email ?? '').trim();
      const rawKey = String(
        contactRecord.key ?? contactRecord.customer_key ?? '',
      ).trim();
      const key = rawKey || customerKey(name);
      if (!key) continue;

      if (mode === 'replace') {
        database
          .prepare(
            'INSERT INTO customer_contacts (customer_key, name, phone, address, email) VALUES (?, ?, ?, ?, ?) ON CONFLICT(customer_key) DO UPDATE SET name = excluded.name, phone = excluded.phone, address = excluded.address, email = excluded.email',
          )
          .run(key, name, phone, address, email);
      } else {
        database
          .prepare(
            `INSERT INTO customer_contacts (customer_key, name, phone, address, email)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(customer_key) DO UPDATE SET
               name = CASE WHEN excluded.name != '' THEN excluded.name ELSE customer_contacts.name END,
               phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE customer_contacts.phone END,
               address = CASE WHEN excluded.address != '' THEN excluded.address ELSE customer_contacts.address END,
               email = CASE WHEN excluded.email != '' THEN excluded.email ELSE customer_contacts.email END`,
          )
          .run(key, name, phone, address, email);
      }
      contactsSaved += 1;
    }

    const currentContacts = listCustomerContactsFromDb(database);

    // Determine highest order number currently in DB or in incoming payload
    let maxOrderSeq = 0;
    const existingOrderNums = database
      .prepare('SELECT order_number FROM work_orders')
      .all() as Array<{ order_number: string }>;
    for (const row of existingOrderNums) {
      maxOrderSeq = Math.max(
        maxOrderSeq,
        extractOrderSequence(row.order_number),
      );
    }
    for (const item of preparedOrders) {
      maxOrderSeq = Math.max(
        maxOrderSeq,
        extractOrderSequence(item.orderNumber),
      );
    }

    const allocateNextOrderNumber = (): string => {
      let candidate = '';
      do {
        maxOrderSeq += 1;
        candidate = formatOrderSequence(maxOrderSeq);
      } while (
        database
          .prepare('SELECT 1 FROM work_orders WHERE order_number = ?')
          .get(candidate)
      );
      return candidate;
    };

    // 2. Upsert work orders
    for (const item of preparedOrders) {
      const normalized = {
        ...item.normalized,
        customerKey:
          item.normalized.customerKey ||
          orderCustomerKey(item.normalized, currentContacts),
      };
      const status = normalizeStatus(normalized.status);
      const vehicle = [
        normalized.vehicleYear,
        normalized.vehicleMake,
        normalized.vehicleModel,
      ]
        .filter(Boolean)
        .join(' ');
      const total = chargeTotals(normalized).total;

      let orderNumber = item.orderNumber;
      if (!orderNumber) {
        orderNumber = allocateNextOrderNumber();
      }

      const byId = database
        .prepare('SELECT id, order_number FROM work_orders WHERE id = ?')
        .get(item.id) as { id: string; order_number: string } | undefined;

      const byOrderNum = database
        .prepare(
          'SELECT id, order_number, customer_name FROM work_orders WHERE order_number = ?',
        )
        .get(orderNumber) as
        | { id: string; order_number: string; customer_name: string }
        | undefined;

      if (byId) {
        let finalOrderNumber = orderNumber;
        if (byOrderNum && byOrderNum.id !== item.id) {
          if (
            isAutoSeededDemoCustomer(byOrderNum.customer_name) &&
            !isAutoSeededDemoCustomer(normalized.customerName.trim())
          ) {
            database
              .prepare('DELETE FROM work_orders WHERE id = ?')
              .run(byOrderNum.id);
          } else {
            finalOrderNumber = byId.order_number;
          }
        }
        const fullOrder: WorkOrder = {
          ...normalized,
          status,
          total,
          id: item.id,
          orderNumber: finalOrderNumber,
          createdAt: item.createdAt,
        };
        database
          .prepare(
            'UPDATE work_orders SET order_number = ?, customer_name = ?, vehicle = ?, status = ?, data_json = ?, created_at = ? WHERE id = ?',
          )
          .run(
            finalOrderNumber,
            normalized.customerName.trim(),
            vehicle,
            status,
            JSON.stringify(fullOrder),
            item.createdAt,
            item.id,
          );
        ordersUpdated += 1;
      } else if (byOrderNum) {
        if (
          isAutoSeededDemoCustomer(byOrderNum.customer_name) &&
          !isAutoSeededDemoCustomer(normalized.customerName.trim())
        ) {
          // Replace the auto-seeded Demo Customer order with the real imported order
          database
            .prepare('DELETE FROM work_orders WHERE id = ?')
            .run(byOrderNum.id);
          const fullOrder: WorkOrder = {
            ...normalized,
            status,
            total,
            id: item.id,
            orderNumber,
            createdAt: item.createdAt,
          };
          database
            .prepare(
              'INSERT INTO work_orders (id, order_number, customer_name, vehicle, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              item.id,
              orderNumber,
              normalized.customerName.trim(),
              vehicle,
              status,
              JSON.stringify(fullOrder),
              item.createdAt,
            );
          ordersAdded += 1;
        } else if (
          !item.hadExplicitId &&
          customerKey(byOrderNum.customer_name) ===
            customerKey(normalized.customerName)
        ) {
          // Legacy/manual backup item without an explicit UUID matching same customer & order number
          const fullOrder: WorkOrder = {
            ...normalized,
            status,
            total,
            id: byOrderNum.id,
            orderNumber: byOrderNum.order_number,
            createdAt: item.createdAt,
          };
          database
            .prepare(
              'UPDATE work_orders SET customer_name = ?, vehicle = ?, status = ?, data_json = ?, created_at = ? WHERE id = ?',
            )
            .run(
              normalized.customerName.trim(),
              vehicle,
              status,
              JSON.stringify(fullOrder),
              item.createdAt,
              byOrderNum.id,
            );
          ordersUpdated += 1;
        } else {
          // Distinct repair order with colliding orderNumber across PCs: allocate next available RO number
          const reassignedOrderNum = allocateNextOrderNumber();
          const fullOrder: WorkOrder = {
            ...normalized,
            status,
            total,
            id: item.id,
            orderNumber: reassignedOrderNum,
            createdAt: item.createdAt,
          };
          database
            .prepare(
              'INSERT INTO work_orders (id, order_number, customer_name, vehicle, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              item.id,
              reassignedOrderNum,
              normalized.customerName.trim(),
              vehicle,
              status,
              JSON.stringify(fullOrder),
              item.createdAt,
            );
          ordersAdded += 1;
        }
      } else {
        const fullOrder: WorkOrder = {
          ...normalized,
          status,
          total,
          id: item.id,
          orderNumber,
          createdAt: item.createdAt,
        };
        database
          .prepare(
            'INSERT INTO work_orders (id, order_number, customer_name, vehicle, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            item.id,
            orderNumber,
            normalized.customerName.trim(),
            vehicle,
            status,
            JSON.stringify(fullOrder),
            item.createdAt,
          );
        ordersAdded += 1;
      }
    }

    // 3. Restore settings if included in backup
    if (payload.settings) {
      writeSettingsToDb(database, payload.settings);
      settingsRestored = true;
    }

    if (payload.dashboardPreferences) {
      const savedPrefs = normalizeDashboardPreferences(
        payload.dashboardPreferences,
      );
      upsertSettingInDb(
        database,
        'dashboard_preferences',
        JSON.stringify(savedPrefs),
      );
    }

    // 4. Ensure next_order_number is strictly greater than all existing order numbers
    const allOrderRows = database
      .prepare('SELECT order_number FROM work_orders')
      .all() as Array<{ order_number: string }>;
    let finalMaxSeq = 0;
    for (const row of allOrderRows) {
      finalMaxSeq = Math.max(
        finalMaxSeq,
        extractOrderSequence(row.order_number),
      );
    }
    const payloadNextOrder =
      Number(
        String(payload.settings?.nextOrderNumber ?? '').replace(/\D/g, ''),
      ) || 1;
    const safeNextOrder = Math.max(
      finalMaxSeq + 1,
      payloadNextOrder,
      mode === 'merge' ? existingNextOrderSetting : 1,
    );
    upsertSettingInDb(database, 'next_order_number', String(safeNextOrder));

    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }

  const totalOrders = (
    database.prepare('SELECT COUNT(*) AS count FROM work_orders').get() as {
      count: number;
    }
  ).count;
  const totalContacts = (
    database
      .prepare('SELECT COUNT(*) AS count FROM customer_contacts')
      .get() as { count: number }
  ).count;

  return {
    mode,
    ordersAdded,
    ordersUpdated,
    contactsSaved,
    settingsRestored,
    totalOrders,
    totalContacts,
  };
}

function isSameFilePath(pathA: string, pathB?: string): boolean {
  if (!pathB) return false;
  const normA = path.resolve(pathA);
  const normB = path.resolve(pathB);
  return process.platform === 'win32'
    ? normA.toLowerCase() === normB.toLowerCase()
    : normA === normB;
}

export async function exportSqliteSnapshot(
  database: DatabaseSync,
  targetFilePath: string,
  activeDbFilePath?: string,
): Promise<void> {
  if (isSameFilePath(targetFilePath, activeDbFilePath)) {
    throw new Error(
      'Cannot overwrite the active live database file. Please choose a different file name or folder.',
    );
  }
  await fs.rm(targetFilePath, { force: true });
  await fs.rm(`${targetFilePath}-wal`, { force: true });
  await fs.rm(`${targetFilePath}-shm`, { force: true });
  database.prepare('VACUUM INTO ?').run(targetFilePath);
}

export async function restoreBackupFromFile(
  database: DatabaseSync,
  filePath: string,
  mode: BackupImportMode = 'merge',
  activeDbFilePath?: string,
): Promise<Omit<BackupImportResult, 'canceled'>> {
  if (isSameFilePath(filePath, activeDbFilePath)) {
    throw new Error(
      'Cannot restore from the currently active database file. Please select an exported backup file.',
    );
  }
  const headerBuffer = Buffer.alloc(16);
  const fileHandle = await fs.open(filePath, 'r');
  let bytesRead = 0;
  try {
    const readRes = await fileHandle.read(headerBuffer, 0, 16, 0);
    bytesRead = readRes.bytesRead;
  } finally {
    await fileHandle.close();
  }

  const isSqliteHeader =
    bytesRead >= 15 &&
    headerBuffer.subarray(0, 15).toString('utf8') === 'SQLite format 3';
  const lowerPath = filePath.toLowerCase();
  const isSqliteExt =
    lowerPath.endsWith('.sqlite') ||
    lowerPath.endsWith('.sqlite3') ||
    lowerPath.endsWith('.db');

  let payload: BackupPayload;
  let sourceFormat: 'json' | 'sqlite';

  if (isSqliteHeader || isSqliteExt) {
    payload = extractBackupPayloadFromSqlite(filePath);
    sourceFormat = 'sqlite';
  } else {
    const rawText = await fs.readFile(filePath, 'utf8');
    payload = parseBackupJson(rawText);
    sourceFormat = 'json';
  }

  const stats = importBackupPayload(database, payload, mode);
  const parts = filePath.split(/[\\/]/);
  const fileName = parts[parts.length - 1] || filePath;

  return {
    ...stats,
    sourceFormat,
    fileName,
  };
}
