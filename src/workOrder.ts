export type DashboardPreferences = {
  query: string;
  statusFilter: string;
  orderSort: string;
  promisedFrom: string;
  promisedTo: string;
};

export function normalizeDashboardPreferences(
  value: Partial<DashboardPreferences> | null,
): DashboardPreferences {
  const date = (value: unknown) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  return {
    query: typeof value?.query === 'string' ? value.query : '',
    statusFilter: ORDER_STATUSES.includes(
      value?.statusFilter as WorkOrderStatus,
    )
      ? value!.statusFilter!
      : '',
    orderSort: ['newest', 'promised', 'customer'].includes(
      value?.orderSort ?? '',
    )
      ? value!.orderSort!
      : 'newest',
    promisedFrom: date(value?.promisedFrom),
    promisedTo: date(value?.promisedTo),
  };
}

export const defaultLegacy = {
  city: 'Aurora',
  state: 'IL',
  zip: '60505',
  phoneExtension: '',
  homePhone: '',
  customerOrderNumber: '',
  writtenBy: '',
  technician: '',
  callWhenReady: 'Yes',
  terms: 'Balance due at vehicle pickup',
  saveOldParts: 'Yes',
  depositAmount: '',
  estimateAuthorizedBy: '',
  estimateMethod: '',
  estimateDate: '',
  estimateTime: '',
  estimateCalledBy: '',
  estimatePhone: '',
  revisedDescription: '',
  revisedParts: '',
  revisedLabor: '',
  revisedAuthorizedBy: '',
  revisedMethod: '',
  revisedDate: '',
  revisedTime: '',
  revisedCalledBy: '',
  revisedPhone: '',
  signature: '',
  signatureDate: '',
  noticeEnglish:
    'NO LABOR WARRANTY ON USED PARTS OR PARTS THAT CUSTOMER BRINGS. SPECIAL ORDER WE REQUIRE {deposit} DEPOSIT. CUSTOMER HAS 3 DAYS TO PICK UP VEHICLE AFTER THAT THERE WILL BE A $25 DAILY CHARGE FOR VEHICLES LEFT ON SHOP PROPERTY. WE ARE NOT RESPONSIBLE FOR ANY DAMAGE OR STOLEN ITEMS FROM THE VEHICLE AFTER CUSTOMER HAS BEEN CALLED.',
  noticeSpanish:
    'NO GARANTÍA DE TRABAJO EN PARTES USADAS O PARTES QUE EL CLIENTE TRAIGA. EN ÓRDENES ESPECIALES REQUERIMOS {deposit} EN DEPÓSITO. EL CLIENTE TIENE 3 DÍAS PARA RECOGER EL CARRO. DESPUÉS HABRÁ CARGO DE $25.00 POR CADA DÍA QUE EL VEHÍCULO ESTÉ EN LA PROPIEDAD. NO SOMOS RESPONSABLES POR DAÑOS O ARTÍCULOS ROBADOS DEL VEHÍCULO DESPUÉS DE HABER NOTIFICADO AL DUEÑO.',
  authorizationText:
    'I hereby authorize the above repair work to be done along with the necessary materials. You and your employees may operate the vehicle for purposes of testing, inspection or delivery at my risk. An express mechanic’s lien is acknowledged on the above vehicle to secure the amount of repairs thereto. It is understood that this company assumes no responsibility for loss or damage by theft or fire or any cause beyond your control.',
};
export type LegacyDetails = typeof defaultLegacy;
export type ChargeLine = {
  kind: 'parts' | 'labor' | 'sublet' | 'fluids' | 'disposal' | 'other';
  description: string;
  amount: string;
  quantity?: string;
  unitPrice?: string;
  partNumber?: string;
  taxable?: boolean;
};
export type ChargeKind = ChargeLine['kind'];
export const ORDER_STATUSES = [
  'open',
  'in_progress',
  'ready',
  'picked_up',
] as const;
export type WorkOrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusLabels: Record<WorkOrderStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  ready: 'Ready',
  picked_up: 'Picked up',
};
export const normalizeStatus = (value: unknown): WorkOrderStatus =>
  ORDER_STATUSES.includes(value as WorkOrderStatus)
    ? (value as WorkOrderStatus)
    : 'open';
export type TaxDefaults = Record<ChargeKind, boolean>;
export const builtInTaxDefaults: TaxDefaults = {
  parts: true,
  labor: false,
  sublet: false,
  fluids: true,
  disposal: false,
  other: true,
};
export const defaultTaxable = (
  kind: ChargeKind,
  defaults: TaxDefaults = builtInTaxDefaults,
) => defaults[kind];
export const RECEIPT_STYLES = ['modern', 'classic'] as const;
export type ReceiptStyle = (typeof RECEIPT_STYLES)[number];
export const normalizeReceiptStyle = (value: unknown): ReceiptStyle =>
  RECEIPT_STYLES.find((style) => style === value) ?? 'modern';
export type TaxSettings = {
  taxRate: string;
  defaults: TaxDefaults;
  nextOrderNumber?: string;
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  shopCity?: string;
  shopState?: string;
  shopZip?: string;
  defaultTerms?: string;
  defaultWrittenBy?: string;
  defaultTechnician?: string;
  defaultCallWhenReady?: string;
  defaultSaveOldParts?: string;
  receiptStyle?: ReceiptStyle;
};

export type EmailProvider = 'resend' | 'gmail';

export type EmailSettings = {
  provider: EmailProvider;
  senderName: string;
  resendApiKey: string;
  resendFromEmail: string;
  gmailUser: string;
  gmailAppPassword: string;
};

export const defaultEmailSettings: EmailSettings = {
  provider: 'resend',
  senderName: 'Katia Auto Sales & Repairs',
  resendApiKey: '',
  resendFromEmail: '',
  gmailUser: '',
  gmailAppPassword: '',
};

export type EmailSendResult = {
  success: boolean;
  message: string;
};
export function normalizeTaxDefaults(value: unknown): TaxDefaults {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    parts:
      typeof source.parts === 'boolean'
        ? source.parts
        : builtInTaxDefaults.parts,
    labor:
      typeof source.labor === 'boolean'
        ? source.labor
        : builtInTaxDefaults.labor,
    sublet:
      typeof source.sublet === 'boolean'
        ? source.sublet
        : builtInTaxDefaults.sublet,
    fluids:
      typeof source.fluids === 'boolean'
        ? source.fluids
        : builtInTaxDefaults.fluids,
    disposal:
      typeof source.disposal === 'boolean'
        ? source.disposal
        : builtInTaxDefaults.disposal,
    other:
      typeof source.other === 'boolean'
        ? source.other
        : builtInTaxDefaults.other,
  };
}
export type EmailDeliveryMetadata = {
  recipient: string;
  sentAt: string;
  messageId: string;
  subject?: string;
  senderEmail?: string;
};

export type WorkOrderInput = {
  customerKey?: string;
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vin: string;
  licensePlate: string;
  mileage: string;
  dateIn: string;
  datePromised: string;
  concerns: string;
  charges: ChargeLine[];
  revisedCharges?: ChargeLine[];
  status?: WorkOrderStatus;
  taxRate?: string;
  taxAmount?: string;
  legacy?: LegacyDetails;
  lastEmailSent?: EmailDeliveryMetadata;
};
export type WorkOrder = WorkOrderInput & {
  id: string;
  orderNumber: string;
  createdAt: string;
  total: number;
};
export const moneyValue = (value: string) =>
  Math.round((Number(String(value ?? '').replace(/[$,]/g, '')) || 0) * 100) /
  100;
export function lineTotal(line: ChargeLine) {
  if (!line.unitPrice?.trim()) return moneyValue(line.amount);
  const rawQty = line.quantity?.trim() ? line.quantity.replace(/,/g, '') : '1';
  const quantity = Number(rawQty);
  const rawPrice = line.unitPrice.replace(/[$,]/g, '');
  const unitPrice = Number(rawPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  return Math.round(quantity * Math.round(unitPrice * 100)) / 100;
}
export function chargeTotals(input: WorkOrderInput) {
  const totals = {
    parts: 0,
    labor: 0,
    sublet: 0,
    fluids: 0,
    disposal: 0,
    other: 0,
    taxable: 0,
    tax: 0,
    total: 0,
  };
  let taxableCents = 0;
  for (const line of input.charges) {
    const cents = Math.round(lineTotal(line) * 100);
    totals[line.kind] += cents;
    if (line.taxable ?? defaultTaxable(line.kind)) taxableCents += cents;
  }
  for (const kind of [
    'parts',
    'labor',
    'sublet',
    'fluids',
    'disposal',
    'other',
  ] as const)
    totals[kind] /= 100;
  totals.taxable = taxableCents / 100;
  const rate = Number(input.taxRate);
  totals.tax =
    input.taxRate?.trim() && Number.isFinite(rate) && rate >= 0
      ? Math.round(totals.taxable * rate) / 100
      : moneyValue(input.taxAmount ?? '');
  totals.total =
    Math.round(
      (totals.parts +
        totals.labor +
        totals.sublet +
        totals.fluids +
        totals.disposal +
        totals.other +
        totals.tax) *
        100,
    ) / 100;
  return totals;
}
export type ChargeTotals = ReturnType<typeof chargeTotals>;
export const otherChargesTotal = (totals: ChargeTotals) =>
  Math.round(
    (totals.sublet + totals.fluids + totals.disposal + totals.other) * 100,
  ) / 100;
export const supplementTotals = (input: WorkOrderInput) =>
  chargeTotals({
    ...input,
    charges: input.revisedCharges ?? [],
    taxAmount: '',
  });
export const hasSupplementLines = (input: WorkOrderInput) =>
  (input.revisedCharges ?? []).some((line) =>
    Boolean(
      line.description?.trim() ||
      line.partNumber?.trim() ||
      line.unitPrice?.trim() ||
      line.amount?.trim(),
    ),
  );
export const revisedEstimateTotal = (input: WorkOrderInput) =>
  Math.round(
    (chargeTotals(input).total + supplementTotals(input).total) * 100,
  ) / 100;
const VALID_CHARGE_KINDS: readonly ChargeKind[] = [
  'parts',
  'labor',
  'sublet',
  'fluids',
  'disposal',
  'other',
];
function normalizeCharges(lines: ChargeLine[]) {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((line) => Boolean(line && typeof line === 'object'))
    .map((line) => {
      const kind: ChargeKind = VALID_CHARGE_KINDS.includes(line.kind)
        ? line.kind
        : 'other';
      const quantity = line.quantity?.trim() ? line.quantity : '1';
      const normalized = {
        ...line,
        kind,
        description: String(line.description ?? ''),
        amount: String(line.amount ?? ''),
        quantity,
        partNumber: line.partNumber ?? '',
        taxable: line.taxable ?? defaultTaxable(kind),
      };
      const unitPrice = line.unitPrice?.trim();
      if (!unitPrice) return normalized;
      return {
        ...normalized,
        unitPrice,
        amount: String(lineTotal({ ...normalized, unitPrice })),
      };
    });
}
export function normalizeInput(input: WorkOrderInput): WorkOrderInput {
  const normalized = {
    ...input,
    email: (input.email ?? '').trim(),
    status: normalizeStatus(input.status),
    taxRate: input.taxRate ?? '',
    charges: normalizeCharges(input.charges),
    revisedCharges: normalizeCharges(input.revisedCharges ?? []),
    legacy: { ...defaultLegacy, ...input.legacy },
    lastEmailSent: input.lastEmailSent ? { ...input.lastEmailSent } : undefined,
  };
  return { ...normalized, taxAmount: String(chargeTotals(normalized).tax) };
}
export const isPromiseDue = (
  order: Pick<WorkOrderInput, 'datePromised' | 'status'>,
  today: string,
) =>
  normalizeStatus(order.status) !== 'picked_up' &&
  Boolean(order.datePromised) &&
  order.datePromised <= today;

export interface CatalogPreset {
  id: string;
  category: ChargeKind;
  shortcut: string;
  name: string;
  description: string;
  partNumber?: string;
  defaultPrice: number;
  defaultQuantity?: number;
  taxable: boolean;
  createdAt: string;
}

export const defaultBodyShopPresets: Omit<CatalogPreset, 'id' | 'createdAt'>[] =
  [
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
      category: 'labor',
      shortcut: 'fender-blend',
      name: 'Fender Blend Panel',
      description: 'Fender panel - blend color & clear coat',
      partNumber: 'PNT-202',
      defaultPrice: 65,
      defaultQuantity: 1.8,
      taxable: false,
    },
    {
      category: 'labor',
      shortcut: 'dent-repair',
      name: 'Dent Pull & Metal Straightening',
      description: 'Dent repair, stud pull, and sheet metal contouring',
      partNumber: 'LAB-102',
      defaultPrice: 75,
      defaultQuantity: 2.0,
      taxable: false,
    },
    {
      category: 'labor',
      shortcut: 'frame-pull',
      name: 'Frame Machine Setup & Pull',
      description:
        'Frame rack setup, anchoring, and structural dimensional pull',
      partNumber: 'FRM-301',
      defaultPrice: 85,
      defaultQuantity: 3.0,
      taxable: false,
    },
    {
      category: 'labor',
      shortcut: 'diag-scan',
      name: 'Pre/Post Collision Diagnostic Scan',
      description:
        'Pre & post repair OBD2 diagnostic computer scan and DTC clearance',
      partNumber: 'DIAG-01',
      defaultPrice: 95,
      defaultQuantity: 1.0,
      taxable: false,
    },
    {
      category: 'labor',
      shortcut: 'paint-prep',
      name: 'Color Sand & De-Nib / Polish',
      description: 'Wet sanding, de-nibbing, buffing, and high-gloss polish',
      partNumber: 'DTL-401',
      defaultPrice: 60,
      defaultQuantity: 2.0,
      taxable: false,
    },
    {
      category: 'sublet',
      shortcut: 'align',
      name: 'Four-Wheel Computer Alignment',
      description:
        'Four-wheel computerized alignment and suspension geometry check',
      partNumber: 'SUB-501',
      defaultPrice: 110,
      defaultQuantity: 1.0,
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
    {
      category: 'parts',
      shortcut: 'clips',
      name: 'Bumper Clips & Retainers Kit',
      description:
        'OEM-spec bumper cover clips, push pins, and hardware fasteners',
      partNumber: 'HRD-002',
      defaultPrice: 28,
      defaultQuantity: 1.0,
      taxable: true,
    },
    {
      category: 'disposal',
      shortcut: 'epa',
      name: 'Hazardous Waste Disposal Fee',
      description: 'EPA environmental waste & paint residue disposal charge',
      partNumber: 'EPA-900',
      defaultPrice: 15,
      defaultQuantity: 1.0,
      taxable: false,
    },
  ];
