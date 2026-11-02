import CustomersView from './Customers';
import EmailOrderModal, { type EmailDraft } from './EmailOrderModal';
import { resolveEmailRoute } from './emailRouting';
import CustomerAutofillSearch from './CustomerAutofillSearch';
import ExpandableCustomerNotes from './ExpandableCustomerNotes';
import WorkOrderCharges from './WorkOrderCharges';
import KatiaLogo from './KatiaLogo';
import LegacyFields from './LegacyFields';
import SettingsView, { type SettingsTab } from './SettingsView';
import WindowTitleBar from './WindowTitleBar';
import {
  Printer,
  Eye,
  Settings,
  Zap,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { decodeVin } from './vinDecoder';
import {
  customerProfiles,
  orderCustomerKey,
  type CustomerContact,
  type CustomerProfile,
  type CustomerVehicle,
  type CustomerVehicleRecord,
} from './customerHistory';
import {
  builtInTaxDefaults,
  chargeTotals,
  defaultLegacy,
  defaultTaxable,
  type ChargeLine,
  isPromiseDue,
  normalizeStatus,
  ORDER_STATUSES,
  orderStatusLabels,
  supplementTotals,
  type LegacyDetails,
  type TaxDefaults,
  type TaxSettings,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderStatus,
} from './workOrder';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const emptyOrder: WorkOrderInput = {
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
  dateIn: today(),
  datePromised: '',
  concerns: '',
  charges: [
    {
      kind: 'labor',
      description: '',
      amount: '',
      quantity: '1',
      unitPrice: '',
    },
    {
      kind: 'parts',
      partNumber: '',
      description: '',
      amount: '',
      quantity: '1',
      unitPrice: '',
    },
  ],
  revisedCharges: [],
  taxRate: '',
  legacy: { ...defaultLegacy },
};

const blankOrder = (
  taxRate = '',
  defaults: TaxDefaults = builtInTaxDefaults,
  settings?: TaxSettings,
): WorkOrderInput => ({
  ...emptyOrder,
  dateIn: today(),
  taxRate,
  charges: [
    { ...emptyOrder.charges[0], taxable: defaults.labor },
    { ...emptyOrder.charges[1], taxable: defaults.parts },
  ],
  revisedCharges: [],
  legacy: {
    ...defaultLegacy,
    city: settings?.shopCity || defaultLegacy.city,
    state: settings?.shopState || defaultLegacy.state,
    zip: settings?.shopZip || defaultLegacy.zip,
    terms: settings?.defaultTerms || defaultLegacy.terms,
    writtenBy: settings?.defaultWrittenBy || defaultLegacy.writtenBy,
    technician: settings?.defaultTechnician || defaultLegacy.technician,
    callWhenReady:
      settings?.defaultCallWhenReady || defaultLegacy.callWhenReady,
    saveOldParts: settings?.defaultSaveOldParts || defaultLegacy.saveOldParts,
  },
});

const editableOrder = (order: WorkOrder): WorkOrderInput => ({
  customerKey: order.customerKey,
  customerName: order.customerName,
  phone: order.phone,
  email: order.email ?? '',
  address: order.address,
  vehicleYear: order.vehicleYear,
  vehicleMake: order.vehicleMake,
  vehicleModel: order.vehicleModel,
  vin: order.vin,
  licensePlate: order.licensePlate,
  mileage: order.mileage,
  dateIn: order.dateIn,
  datePromised: order.datePromised,
  concerns: order.concerns,
  charges: order.charges.map((line) => ({ ...line })),
  revisedCharges: (order.revisedCharges ?? []).map((line) => ({ ...line })),
  status: normalizeStatus(order.status),
  taxRate: order.taxRate ?? '',
  taxAmount: order.taxAmount ?? '',
  legacy: { ...defaultLegacy, ...order.legacy },
});

const hasChargeContent = (line: ChargeLine) =>
  Boolean(line.description?.trim()) ||
  Boolean(line.partNumber?.trim()) ||
  Boolean(line.unitPrice?.trim()) ||
  (line.amount !== '' && line.amount !== undefined && Number(line.amount) > 0);

const isOrderBeingFilled = (
  form: WorkOrderInput,
  editing: boolean,
): boolean => {
  if (editing) return true;
  const filled = [
    form.customerName,
    form.phone,
    form.email,
    form.address,
    form.vehicleYear,
    form.vehicleMake,
    form.vehicleModel,
    form.vin,
    form.licensePlate,
    form.mileage,
    form.concerns,
    form.datePromised,
  ];
  return (
    filled.some((value) => Boolean(value?.trim())) ||
    form.charges.some(hasChargeContent)
  );
};

const applyTaxDefaultChanges = (
  lines: ChargeLine[],
  previous: TaxDefaults,
  next: TaxDefaults,
) =>
  lines.map((line) =>
    line.taxable === undefined ||
    line.taxable === defaultTaxable(line.kind, previous)
      ? { ...line, taxable: defaultTaxable(line.kind, next) }
      : line,
  );

const applyShopDefaults = (
  form: WorkOrderInput,
  settings: TaxSettings,
  previous: TaxDefaults = builtInTaxDefaults,
): WorkOrderInput => ({
  ...form,
  taxRate: form.taxRate || settings.taxRate,
  charges: applyTaxDefaultChanges(form.charges, previous, settings.defaults),
  revisedCharges: applyTaxDefaultChanges(
    form.revisedCharges ?? [],
    previous,
    settings.defaults,
  ),
  legacy: {
    ...defaultLegacy,
    ...form.legacy,
    city: form.legacy?.city || settings.shopCity || defaultLegacy.city,
    state: form.legacy?.state || settings.shopState || defaultLegacy.state,
    zip: form.legacy?.zip || settings.shopZip || defaultLegacy.zip,
    terms: form.legacy?.terms || settings.defaultTerms || defaultLegacy.terms,
    writtenBy:
      form.legacy?.writtenBy ||
      settings.defaultWrittenBy ||
      defaultLegacy.writtenBy,
    technician:
      form.legacy?.technician ||
      settings.defaultTechnician ||
      defaultLegacy.technician,
    callWhenReady:
      form.legacy?.callWhenReady ||
      settings.defaultCallWhenReady ||
      defaultLegacy.callWhenReady,
    saveOldParts:
      form.legacy?.saveOldParts ||
      settings.defaultSaveOldParts ||
      defaultLegacy.saveOldParts,
  },
});

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  wide = false,
}: {
  label: string;
  name: keyof WorkOrderInput;
  value: string;
  onChange: (name: keyof WorkOrderInput, value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? 'full-width' : ''}`}>
      <span>
        {label}
        {required && <b className="required"> *</b>}
      </span>
      <input
        name={name}
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? '0' : undefined}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function SwitchVehicleIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h16" />
      <path d="m16 4 4 4-4 4" />
      <path d="M20 16H4" />
      <path d="m8 12-4 4 4 4" />
    </svg>
  );
}

function App() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [form, setForm] = useState<WorkOrderInput>(emptyOrder);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orderSort, setOrderSort] = useState('newest');
  const [promisedFrom, setPromisedFrom] = useState('');
  const [promisedTo, setPromisedTo] = useState('');
  const [dueFilterActive, setDueFilterActive] = useState(false);
  const [noticeAction, setNoticeAction] = useState<{
    label: string;
    onClick: () => void;
  } | null>(null);
  const hasOrderFilters = Boolean(
    query.trim() ||
    statusFilter ||
    promisedFrom ||
    promisedTo ||
    dueFilterActive,
  );
  const [creating, setCreating] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<WorkOrder | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkOrder | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<{
    action: () => void;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('shop');
  const [customersOpen, setCustomersOpen] = useState(false);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(
    null,
  );
  const [returnCustomerKey, setReturnCustomerKey] = useState<string | null>(
    null,
  );
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>(
    [],
  );
  const [customerVehicles, setCustomerVehicles] = useState<
    CustomerVehicleRecord[]
  >([]);
  const [shopDefaults, setShopDefaults] = useState<TaxDefaults>({
    ...builtInTaxDefaults,
  });
  const [shopSettings, setShopSettings] = useState<TaxSettings>({
    taxRate: '',
    defaults: { ...builtInTaxDefaults },
    nextOrderNumber: '1',
    shopName: 'Katia Auto Sales & Repairs',
    shopPhone: '(630) 907-7198',
    shopAddress: '1005 Rural St, Aurora, IL 60505',
  });
  const [savedTaxRate, setSavedTaxRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNoticeText] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [appVersion, setAppVersion] = useState('1.1.4');
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailModalError, setEmailModalError] = useState('');
  const [showAddress, setShowAddress] = useState(false);
  const focusStreetOnOpen = useRef(false);
  const [switchVehicleOpen, setSwitchVehicleOpen] = useState(false);
  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinFeedback, setVinFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  function setNotice(text: string, options?: { error?: boolean }) {
    setNoticeText(text);
    setNoticeIsError(Boolean(text) && Boolean(options?.error));
  }

  useEffect(() => {
    void window.repairDesk
      .getDashboardPreferences()
      .then((saved) => {
        setQuery(saved.query);
        setStatusFilter(saved.statusFilter);
        setOrderSort(saved.orderSort);
        setPromisedFrom(saved.promisedFrom);
        setPromisedTo(saved.promisedTo);
        setDashboardLoaded(true);
      })
      .catch(() =>
        setNotice('Could not load saved dashboard choices.', { error: true }),
      );
  }, []);

  useEffect(() => {
    if (!dashboardLoaded) return;
    void window.repairDesk
      .saveDashboardPreferences({
        query,
        statusFilter,
        orderSort,
        promisedFrom,
        promisedTo,
      })
      .catch(() =>
        setNotice('Could not remember dashboard choices.', { error: true }),
      );
  }, [
    dashboardLoaded,
    query,
    statusFilter,
    orderSort,
    promisedFrom,
    promisedTo,
  ]);

  useEffect(() => {
    void window.repairDesk.listWorkOrders().then(setOrders);
    if (window.repairDesk.getAppVersion) {
      void window.repairDesk
        .getAppVersion()
        .then((ver) => ver && setAppVersion(ver))
        .catch(() => undefined);
    }
    void window.repairDesk
      .listCustomerContacts()
      .then(setCustomerContacts)
      .catch(() => undefined);
    void window.repairDesk
      .listCustomerVehicles()
      .then(setCustomerVehicles)
      .catch(() => undefined);
    void window.repairDesk
      .getSettings()
      .then((settings) => {
        setShopSettings(settings);
        setShopDefaults(settings.defaults);
        setSavedTaxRate(settings.taxRate);
        setForm((current) => applyShopDefaults(current, settings));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => {
        setNotice('');
        setNoticeAction(null);
      },
      noticeAction ? 9000 : 4500,
    );
    return () => window.clearTimeout(timeout);
  }, [notice, noticeAction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        startNewOrder();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'f'
      ) {
        const searchInput = document.querySelector<HTMLInputElement>(
          '.orders-actions input, .customer-search input',
        );
        if (searchInput) {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      } else if (event.key === 'Escape') {
        if (pendingDiscard) {
          setPendingDiscard(null);
        } else if (pendingDelete) {
          setPendingDelete(null);
        } else if (creating) {
          guardDraft(closeOrderForm);
        } else if (dueFilterActive) {
          setDueFilterActive(false);
        } else if (query) {
          setQuery('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    creating,
    pendingDelete,
    pendingDiscard,
    dueFilterActive,
    query,
    form,
    editingId,
  ]);

  const openOrdersCount = useMemo(
    () =>
      orders.filter((order) => normalizeStatus(order.status) !== 'picked_up')
        .length,
    [orders],
  );
  const dueTodayCount = useMemo(
    () => orders.filter((order) => isPromiseDue(order, today())).length,
    [orders],
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matchingDatesAndStatus = orders.filter(
      (order) =>
        (!dueFilterActive || isPromiseDue(order, today())) &&
        (!statusFilter || normalizeStatus(order.status) === statusFilter) &&
        (!(promisedFrom || promisedTo) ||
          (Boolean(order.datePromised) &&
            (!promisedFrom || order.datePromised >= promisedFrom) &&
            (!promisedTo || order.datePromised <= promisedTo))),
    );
    if (!normalized) return matchingDatesAndStatus;
    const vehicleQuery = normalized.replace(/[\s-]+/g, '');
    return matchingDatesAndStatus.filter(
      (order) =>
        [
          order.orderNumber,
          order.customerName,
          customerContacts.find(
            (contact) =>
              contact.key === orderCustomerKey(order, customerContacts),
          )?.name ?? '',
          order.vin,
          order.vehicleYear,
          order.vehicleMake,
          order.vehicleModel,
          order.licensePlate,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized) ||
        (Boolean(vehicleQuery) &&
          [order.vin, order.licensePlate].some((value) =>
            value
              .toLowerCase()
              .replace(/[\s-]+/g, '')
              .includes(vehicleQuery),
          )),
    );
  }, [
    orders,
    query,
    customerContacts,
    statusFilter,
    promisedFrom,
    promisedTo,
    dueFilterActive,
  ]);

  const sortedOrders = useMemo(
    () =>
      [...filteredOrders].sort((a, b) => {
        const newest = b.createdAt.localeCompare(a.createdAt);
        if (orderSort === 'promised')
          return (
            (a.datePromised || '9999-12-31').localeCompare(
              b.datePromised || '9999-12-31',
            ) || newest
          );
        if (orderSort === 'customer')
          return (
            a.customerName.localeCompare(b.customerName, undefined, {
              sensitivity: 'base',
            }) || newest
          );
        return newest;
      }),
    [filteredOrders, orderSort],
  );

  const editingOrder = editingId
    ? orders.find((order) => order.id === editingId)
    : undefined;
  const customers = useMemo(
    () => customerProfiles(orders, customerContacts, customerVehicles),
    [orders, customerContacts, customerVehicles],
  );
  const totals = chargeTotals(form);
  const revisedTotals = supplementTotals(form);
  const total = totals.total;
  const updateField = (name: keyof WorkOrderInput, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  useEffect(() => {
    if (!vinFeedback) return;
    const timer = window.setTimeout(() => {
      setVinFeedback(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [vinFeedback]);

  const handleDecodeVin = async (rawVin?: string) => {
    const targetVin = (rawVin ?? form.vin)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (!targetVin) {
      setVinFeedback({ type: 'error', message: 'Enter a 17-character VIN' });
      return;
    }
    if (targetVin.length !== 17) {
      setVinFeedback({
        type: 'error',
        message: `VIN must be 17 characters (${targetVin.length} entered)`,
      });
      return;
    }

    setVinDecoding(true);
    setVinFeedback(null);

    try {
      const decoded = await decodeVin(targetVin);
      setForm((current) => ({
        ...current,
        vin: targetVin,
        vehicleYear: decoded.year || current.vehicleYear,
        vehicleMake: decoded.make || current.vehicleMake,
        vehicleModel: decoded.model || current.vehicleModel,
      }));
      setVinFeedback({
        type: 'success',
        message:
          `${decoded.year} ${decoded.make} ${decoded.model}`.trim() ||
          'Vehicle specs decoded',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lookup failed';
      setVinFeedback({
        type: 'error',
        message: msg.length > 45 ? 'Vehicle not found in NHTSA' : msg,
      });
    } finally {
      setVinDecoding(false);
    }
  };

  const updateLegacyField = (key: keyof LegacyDetails, value: string) => {
    setForm((current) => ({
      ...current,
      legacy: {
        ...defaultLegacy,
        ...current.legacy,
        [key]: value,
      },
    }));
  };

  const matchingCustomer = useMemo(() => {
    if (form.customerKey) {
      const byKey = customers.find((c) => c.key === form.customerKey);
      if (byKey) return byKey;
    }
    const nameTrimmed = form.customerName.trim().toLowerCase();
    if (nameTrimmed) {
      const byName = customers.find(
        (c) => c.name.trim().toLowerCase() === nameTrimmed,
      );
      if (byName) return byName;
    }
    const phoneDigits = form.phone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length >= 7) {
      const byPhone = customers.find((c) =>
        c.phone.replace(/\D/g, '').includes(phoneDigits),
      );
      if (byPhone) return byPhone;
    }
    return null;
  }, [form.customerKey, form.customerName, form.phone, customers]);

  const matchingCustomerVehicles = useMemo(
    () => matchingCustomer?.vehicles ?? [],
    [matchingCustomer],
  );

  function handleSelectVehicle(vehicle: CustomerVehicle) {
    setForm((current) => ({
      ...current,
      vehicleYear: vehicle.vehicleYear,
      vehicleMake: vehicle.vehicleMake,
      vehicleModel: vehicle.vehicleModel,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
    }));
    setSwitchVehicleOpen(false);
  }

  function guardDraft(action: () => void) {
    if (isOrderBeingFilled(form, Boolean(editingId))) {
      setPendingDiscard({ action });
      return;
    }
    action();
  }

  function discardDraftAndContinue() {
    const action = pendingDiscard?.action;
    setPendingDiscard(null);
    action?.();
  }

  function resetWorkspace() {
    setSettingsOpen(false);
    setCustomersOpen(false);
    setEditingId(null);
    setDuplicateOf(null);
    setReturnCustomerKey(null);
  }

  function startNewOrderNow() {
    setNotice('');
    resetWorkspace();
    setShowAddress(false);
    setSwitchVehicleOpen(false);
    setForm(blankOrder(savedTaxRate, shopDefaults, shopSettings));
    setCreating(true);
  }

  function startNewOrder() {
    guardDraft(startNewOrderNow);
  }

  function openCustomersNow() {
    setNotice('');
    resetWorkspace();
    setCreating(false);
    if (!customersOpen) setSelectedCustomerKey(null);
    setCustomersOpen(true);
  }

  function openCustomers() {
    guardDraft(openCustomersNow);
  }

  function openDashboardNow() {
    resetWorkspace();
    setCreating(false);
  }

  function openDashboard() {
    guardDraft(openDashboardNow);
  }

  async function saveCustomerContact(contact: CustomerContact) {
    setBusy(true);
    setNotice('');
    try {
      const saved = await window.repairDesk.saveCustomerContact(contact);
      setCustomerContacts((current) => [
        ...current.filter((entry) => entry.key !== saved.key),
        saved,
      ]);
      setSelectedCustomerKey(saved.key);
      setNotice('Customer details saved.');
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not save customer contact details.',
        { error: true },
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomerVehicle(vehicle: {
    customerKey: string;
    year: string;
    make: string;
    model: string;
    licensePlate: string;
    vin: string;
    mileage: string;
  }) {
    setBusy(true);
    setNotice('');
    try {
      const saved = await window.repairDesk.saveCustomerVehicle(vehicle);
      setCustomerVehicles((current) => [
        saved,
        ...current.filter((entry) => entry.id !== saved.id),
      ]);
      setNotice('Vehicle saved to customer profile.');
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Could not save vehicle.',
        { error: true },
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openTaxSettingsNow(tab: SettingsTab | unknown = 'shop') {
    const targetTab: SettingsTab =
      typeof tab === 'string' &&
      ['shop', 'taxes', 'email', 'appearance', 'backup'].includes(tab)
        ? (tab as SettingsTab)
        : 'shop';
    setNotice('');
    resetWorkspace();
    setCreating(false);
    setSettingsTab(targetTab);
    setSettingsOpen(true);
  }

  function openTaxSettings(tab: SettingsTab | unknown = 'shop') {
    guardDraft(() => openTaxSettingsNow(tab));
  }

  function startFromHistory(
    customer: CustomerProfile,
    vehicle?: CustomerVehicle,
  ) {
    setNotice('');
    resetWorkspace();
    setForm({
      ...blankOrder(savedTaxRate, shopDefaults, shopSettings),
      customerKey: customer.key,
      customerName: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address,
      vehicleYear: vehicle?.vehicleYear ?? '',
      vehicleMake: vehicle?.vehicleMake ?? '',
      vehicleModel: vehicle?.vehicleModel ?? '',
      vin: vehicle?.vin ?? '',
      licensePlate: vehicle?.licensePlate ?? '',
      mileage: '',
    });
    setCreating(true);
  }

  function autofillFromCustomer(
    customer: CustomerProfile,
    vehicle?: CustomerVehicle,
  ) {
    if (customer.address?.trim()) {
      setShowAddress(true);
    }
    setForm((current) => ({
      ...current,
      customerKey: customer.key,
      customerName: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address,
      vehicleYear: vehicle?.vehicleYear ?? '',
      vehicleMake: vehicle?.vehicleMake ?? '',
      vehicleModel: vehicle?.vehicleModel ?? '',
      vin: vehicle?.vin ?? '',
      licensePlate: vehicle?.licensePlate ?? '',
      mileage: '',
    }));
  }

  function startEdit(order: WorkOrder, returnCustomer: string | null = null) {
    setNotice('');
    resetWorkspace();
    setEditingId(order.id);
    setReturnCustomerKey(returnCustomer);
    if (returnCustomer) setSelectedCustomerKey(returnCustomer);
    setShowAddress(Boolean(order.address?.trim()));
    setSwitchVehicleOpen(false);
    setForm({
      ...editableOrder(order),
      customerKey: orderCustomerKey(order, customerContacts),
    });
    setCreating(true);
  }

  function startDuplicate(order: WorkOrder) {
    const copy = {
      ...editableOrder(order),
      customerKey: orderCustomerKey(order, customerContacts),
    };
    setShowAddress(Boolean(copy.address?.trim()));
    setSwitchVehicleOpen(false);
    const rate = copy.taxRate?.trim() ? copy.taxRate : savedTaxRate;
    setNotice('');
    resetWorkspace();
    setDuplicateOf(order);
    setForm({
      ...copy,
      dateIn: today(),
      datePromised: '',
      status: 'open',
      taxRate: rate,
      taxAmount: rate.trim() ? copy.taxAmount : '',
      legacy: {
        ...defaultLegacy,
        ...copy.legacy,
        signature: '',
        signatureDate: '',
        depositAmount: '',
        estimateAuthorizedBy: '',
        estimateMethod: '',
        estimateDate: '',
        estimateTime: '',
        estimateCalledBy: '',
        estimatePhone: '',
        revisedAuthorizedBy: '',
        revisedMethod: '',
        revisedDate: '',
        revisedTime: '',
        revisedCalledBy: '',
        revisedPhone: '',
      },
    });
    setCreating(true);
  }

  async function deleteOrder() {
    if (!pendingDelete) return;
    setBusy(true);
    setNotice('');
    try {
      await window.repairDesk.deleteWorkOrder(pendingDelete.id);
      setOrders((current) =>
        current.filter((order) => order.id !== pendingDelete.id),
      );
      setNotice(`${pendingDelete.orderNumber} deleted.`);
      setPendingDelete(null);
    } catch {
      setNotice('Could not delete this repair order.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  function closeOrderForm() {
    const returnCustomer = returnCustomerKey;
    setEditingId(null);
    setDuplicateOf(null);
    setForm(blankOrder(savedTaxRate, shopDefaults, shopSettings));
    setCreating(false);
    setNotice('');
    setReturnCustomerKey(null);
    if (returnCustomer) {
      setSelectedCustomerKey(returnCustomer);
      setCustomersOpen(true);
    }
  }

  async function checkEmailConfigured(): Promise<{
    configured: boolean;
    senderDescription: string;
    provider: 'gmail' | 'resend' | null;
  }> {
    try {
      const [gmail, resendStatus, resendSettings] = await Promise.all([
        window.repairDesk.getGmailStatus().catch(() => null),
        window.repairDesk.getResendStatus().catch(() => null),
        window.repairDesk.getResendSettings().catch(() => null),
      ]);
      const route = resolveEmailRoute(
        gmail,
        resendStatus,
        resendSettings?.provider,
      );
      if (route.kind === 'gmail' || route.kind === 'resend') {
        return {
          configured: true,
          senderDescription: route.senderDescription,
          provider: route.kind,
        };
      }
      return { configured: false, senderDescription: '', provider: null };
    } catch {
      return { configured: false, senderDescription: '', provider: null };
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const editing = Boolean(editingId);
    const returnCustomer = editing ? returnCustomerKey : null;
    try {
      const saved = editingId
        ? await window.repairDesk.updateWorkOrder(editingId, form)
        : await window.repairDesk.createWorkOrder(form);
      setOrders((current) =>
        editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      if (!editing && form.taxRate?.trim())
        setSavedTaxRate(form.taxRate.trim());
      setEditingId(null);
      setDuplicateOf(null);
      setForm(
        blankOrder(
          form.taxRate?.trim() || savedTaxRate,
          shopDefaults,
          shopSettings,
        ),
      );
      setReturnCustomerKey(null);
      if (returnCustomer) {
        setSelectedCustomerKey(orderCustomerKey(saved, customerContacts));
        setCustomersOpen(true);
      }
      setCreating(false);

      // Trigger native print dialog asynchronously
      void window.repairDesk.printOrder(saved).catch((printErr) => {
        console.warn('Direct print error:', printErr);
      });

      // Check if email delivery is configured (Resend or Gmail)
      const emailConfig = await checkEmailConfigured();
      if (emailConfig.configured) {
        const contact = customerContacts.find(
          (c) => c.key === orderCustomerKey(saved, customerContacts),
        );
        const recipient = saved.email || contact?.email || form.email || '';
        setEmailModalError('');
        setEmailDraft({
          mode: 'post-save',
          order: saved,
          recipient,
          subject: `Repair Order ${saved.orderNumber} · Katia Auto Sales & Repairs`,
          note: `Thank you for choosing Katia Auto Sales & Repairs. Attached is your official repair order and invoice (${saved.orderNumber}.pdf).`,
          senderDescription: emailConfig.senderDescription,
          provider: emailConfig.provider,
          routeReady: true,
        });
      } else {
        setNotice(
          `${saved.orderNumber} ${editing ? 'updated' : 'saved'} and sent to printer.`,
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not save this repair order.',
        { error: true },
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePdf(order: WorkOrder) {
    setNotice('');
    setNoticeAction(null);
    try {
      const res = await window.repairDesk.saveWorkOrderPdf(order);
      const saved = typeof res === 'object' ? res.saved : Boolean(res);
      const filePath = typeof res === 'object' ? res.filePath : undefined;
      if (saved) {
        setNotice(`${order.orderNumber} saved as a PDF.`);
        if (filePath) {
          setNoticeAction({
            label: 'Open PDF',
            onClick: () => {
              void window.repairDesk.openPath(filePath);
            },
          });
        }
      }
    } catch {
      setNotice('Could not create the PDF. Please try again.', { error: true });
    }
  }

  async function printBlankOrder() {
    try {
      await window.repairDesk.printBlankOrder();
    } catch (err) {
      console.warn('Could not launch blank order print:', err);
      setNotice('Could not open blank order print preview.', { error: true });
    }
  }

  function getDraftPreviewOrder(): WorkOrder {
    const existingOrder = editingId
      ? orders.find((o) => o.id === editingId)
      : null;
    const nextNum = shopSettings.nextOrderNumber
      ? String(Number(shopSettings.nextOrderNumber)).padStart(5, '0')
      : '00001';
    const orderNumber = existingOrder?.orderNumber || `RO-${nextNum}`;
    const createdAt = existingOrder?.createdAt || new Date().toISOString();
    const totals = chargeTotals(form);
    return {
      ...form,
      id: existingOrder?.id || 'draft-preview',
      orderNumber,
      createdAt,
      total: totals.total,
      legacy: { ...defaultLegacy, ...form.legacy },
    };
  }

  async function previewCurrentOrder() {
    try {
      const draft = getDraftPreviewOrder();
      await window.repairDesk.printOrder(draft, { autoPrint: false });
    } catch (err) {
      console.warn('Could not launch order preview:', err);
      setNotice('Could not open print preview.', { error: true });
    }
  }

  function openEmailModal(order: WorkOrder) {
    const contact = customerContacts.find(
      (c) => c.key === orderCustomerKey(order, customerContacts),
    );
    setEmailModalError('');
    setEmailDraft({
      mode: 'full',
      order,
      recipient: order.email || contact?.email || '',
      subject: `Repair Order ${order.orderNumber} · Katia Auto Sales & Repairs`,
      note: `Thank you for choosing Katia Auto Sales & Repairs. Attached is the official repair order and invoice (${order.orderNumber}.pdf) for your records.`,
      gmail: null,
      resend: null,
    });
    void Promise.all([
      window.repairDesk.getGmailStatus().catch(() => null),
      window.repairDesk.getResendStatus().catch(() => null),
      window.repairDesk.getResendSettings().catch(() => null),
    ])
      .then(([gmail, resendStatus, resendSettings]) => {
        const route = resolveEmailRoute(
          gmail,
          resendStatus,
          resendSettings?.provider,
        );
        setEmailDraft((current) =>
          current?.mode === 'full'
            ? {
                ...current,
                gmail,
                resend: resendStatus,
                provider: route.kind === 'none' ? null : route.kind,
                senderDescription:
                  route.kind === 'none' ? undefined : route.senderDescription,
                routeReady: route.kind !== 'none',
              }
            : current,
        );
      })
      .catch(console.error);
  }

  function closeEmailModal() {
    if (emailSending) return;
    if (emailDraft?.mode === 'post-save') {
      setNotice(`${emailDraft.order.orderNumber} saved and sent to printer.`);
    }
    setEmailDraft(null);
    setEmailModalError('');
  }

  async function sendEmailDraft() {
    if (!emailDraft) return;
    const recipient = emailDraft.recipient.trim();
    if (!recipient) {
      setEmailModalError('Please enter a recipient email address.');
      return;
    }
    if (!emailDraft.subject.trim()) {
      setEmailModalError('Please enter an email subject line.');
      return;
    }
    setEmailSending(true);
    setEmailModalError('');
    const { mode, order } = emailDraft;
    try {
      if (mode === 'post-save') {
        const emailConfig = await checkEmailConfigured();
        if (!emailConfig.configured) {
          setEmailModalError(
            'No email delivery service is configured. Configure Resend or connect Gmail in Settings.',
          );
          return;
        }
      }
      const res = await window.repairDesk.sendOrderEmail({
        orderId: order.id,
        recipient,
        subject: emailDraft.subject.trim(),
        personalNote: emailDraft.note.trim(),
        provider: emailDraft.provider ?? undefined,
      });
      if (!res.success) {
        setEmailModalError('Could not send email.');
        return;
      }
      setNotice(
        mode === 'post-save'
          ? `✓ ${order.orderNumber} sent via email to ${recipient}!`
          : `${order.orderNumber} sent via email to ${recipient}`,
      );
      setEmailDraft(null);
      void window.repairDesk.listWorkOrders().then(setOrders);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEmailModalError(msg);
    } finally {
      setEmailSending(false);
    }
  }

  async function exportBackup() {
    setBusy(true);
    setNotice('');
    setNoticeAction(null);
    try {
      const saved = await window.repairDesk.exportBackupJson();
      if (saved) setNotice('Database backup exported successfully.');
    } catch {
      setNotice('Could not export database backup.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function exportSqliteBackup() {
    setBusy(true);
    setNotice('');
    setNoticeAction(null);
    try {
      const saved = await window.repairDesk.exportBackupSqlite();
      if (saved) setNotice('SQLite database exported successfully.');
    } catch (err: unknown) {
      const rawMsg =
        err instanceof Error
          ? err.message
          : 'Could not export SQLite database.';
      const msg = rawMsg.replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/i,
        '',
      );
      setNotice(msg || 'Could not export SQLite database.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(
    mode: import('./backupService').BackupImportMode,
  ) {
    setBusy(true);
    setNotice('');
    setNoticeAction(null);
    try {
      const result = await window.repairDesk.importBackup(mode);
      if (!result.canceled) {
        const [freshOrders, freshContacts, freshSettings, freshDashboardPrefs] =
          await Promise.all([
            window.repairDesk.listWorkOrders(),
            window.repairDesk.listCustomerContacts(),
            window.repairDesk.getSettings(),
            window.repairDesk.getDashboardPreferences(),
          ]);
        const previousDefaults = shopDefaults;
        setOrders(freshOrders);
        setCustomerContacts(freshContacts);
        setShopSettings(freshSettings);
        setShopDefaults(freshSettings.defaults);
        setSavedTaxRate(freshSettings.taxRate);
        setQuery(freshDashboardPrefs.query);
        setStatusFilter(freshDashboardPrefs.statusFilter);
        setOrderSort(freshDashboardPrefs.orderSort);
        setPromisedFrom(freshDashboardPrefs.promisedFrom);
        setPromisedTo(freshDashboardPrefs.promisedTo);

        const freshProfiles = customerProfiles(freshOrders, freshContacts);
        setSelectedCustomerKey((currentKey) =>
          currentKey && freshProfiles.some((p) => p.key === currentKey)
            ? currentKey
            : null,
        );

        setForm((current) =>
          applyShopDefaults(current, freshSettings, previousDefaults),
        );

        const modeDesc =
          result.mode === 'replace' ? 'restored' : 'merged into database';
        setNotice(
          `Backup ${modeDesc} (${result.ordersAdded} added, ${result.ordersUpdated} updated, ${result.totalOrders} total orders).`,
        );
      }
      return result;
    } catch (err: unknown) {
      const rawMsg =
        err instanceof Error ? err.message : 'Could not restore backup file.';
      const msg =
        rawMsg.replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/i,
          '',
        ) || 'Could not restore backup file.';
      setNotice(msg, { error: true });
      throw new Error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setNotice('');
    setNoticeAction(null);
    try {
      const saved = await window.repairDesk.exportOrdersCsv();
      if (saved) setNotice('Repair orders exported to CSV successfully.');
    } catch {
      setNotice('Could not export to CSV.', { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(order: WorkOrder, status: WorkOrderStatus) {
    setNotice('');
    try {
      const saved = await window.repairDesk.setWorkOrderStatus(
        order.id,
        status,
      );
      setOrders((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
    } catch {
      setNotice('Could not update the repair order status.', { error: true });
    }
  }

  async function saveShopSettings(updated: TaxSettings) {
    setBusy(true);
    setNotice('');
    try {
      const saved = await window.repairDesk.saveSettings(updated);
      setShopSettings(saved);
      const previous = shopDefaults;
      setShopDefaults(saved.defaults);
      setSavedTaxRate(saved.taxRate);
      setForm((current) => applyShopDefaults(current, saved, previous));
      setNotice('Shop configuration applied successfully.');
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not save configuration.',
        { error: true },
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="window-frame">
      <WindowTitleBar />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark" title="Katia Auto Sales & Repairs">
              <KatiaLogo size={38} />
            </div>
            <div>
              <strong>KATIA</strong>
              <small>BODY SHOP</small>
            </div>
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <button
            className={`nav-item ${!creating && !settingsOpen && !customersOpen ? 'active' : ''}`}
            onClick={openDashboard}
          >
            <span className="nav-icon">▦</span> Repair orders
            <span className="nav-count">{orders.length}</span>
          </button>
          <button
            className={`nav-item ${creating && !settingsOpen && !editingId ? 'active' : ''}`}
            onClick={startNewOrder}
          >
            <span className="nav-icon">＋</span> New repair order
          </button>
          <button
            className={`nav-item ${customersOpen ? 'active' : ''}`}
            onClick={openCustomers}
          >
            <span className="nav-icon">☺</span> Customers
            <span className="nav-count">{customers.length}</span>
          </button>
          <div className="sidebar-bottom">
            <button
              className={`nav-item ${settingsOpen ? 'active' : ''}`}
              onClick={openTaxSettings}
              title="Settings & System Configuration"
            >
              <span className="nav-icon">
                <Settings size={18} />
              </span>
              Settings
            </button>
            <div
              className="sidebar-version-pill"
              title="Automatic updates enabled via GitHub Releases"
            >
              <span className="status-dot" />
              <span>v{appVersion}</span>
              <span className="version-status-tag">Auto-update</span>
            </div>
          </div>
        </aside>

        <main className="main-area">
          <div
            className={`page-content ${creating && !settingsOpen && !customersOpen ? 'order-workspace' : ''}`}
          >
            <section className="welcome-row">
              <div>
                <div className="eyebrow">BODY SHOP · AURORA, IL</div>
                <h1>
                  {settingsOpen
                    ? 'Tax & settings'
                    : customersOpen
                      ? 'Customers'
                      : creating
                        ? editingOrder
                          ? `Edit ${editingOrder.orderNumber}`
                          : duplicateOf
                            ? `Duplicate ${duplicateOf.orderNumber}`
                            : 'New repair order'
                        : `${getGreeting()}, Katia ✳`}
                </h1>
                <p>
                  {settingsOpen
                    ? 'Choose how each charge type is taxed and manage backups.'
                    : customersOpen
                      ? 'Repeat customers, their vehicles, and every repair order on file.'
                      : creating
                        ? editingOrder
                          ? 'Update this order’s customer, vehicle, dates, and line items.'
                          : duplicateOf
                            ? 'Review the copied details, then save to create a new repair order.'
                            : 'Capture the customer, vehicle, and repair details.'
                        : 'Here’s what’s happening in your shop today.'}
                </p>
              </div>
              {settingsOpen && (
                <div className="settings-header-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void printBlankOrder()}
                    title="Print a blank repair order to fill out by hand"
                  >
                    <Printer size={16} /> Print blank order
                  </button>
                </div>
              )}
              {creating && !settingsOpen && !customersOpen && (
                <div className="order-actions">
                  <div className="order-running-total">
                    <span>Total amount</span>
                    <strong>${total.toFixed(2)}</strong>
                  </div>
                  {isOrderBeingFilled(form, Boolean(editingId)) && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void previewCurrentOrder()}
                      title="Preview how this order will look when printed"
                    >
                      <Eye size={15} /> Preview
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={closeOrderForm}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="new-repair-order"
                    className="primary-button"
                    disabled={busy}
                  >
                    {busy ? 'Saving & Printing…' : 'Save & Print'}{' '}
                    <Printer size={16} />
                  </button>
                </div>
              )}
              {!creating && !settingsOpen && !customersOpen && (
                <div className="dashboard-header-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void printBlankOrder()}
                    title="Print a blank repair order to fill out by hand"
                  >
                    <Printer size={16} /> Print blank order
                  </button>
                  <button className="primary-button" onClick={startNewOrder}>
                    <span>＋</span> New repair order
                  </button>
                </div>
              )}
            </section>

            {notice && (
              <div
                className={`notice ${noticeIsError ? 'error' : ''}`}
                role={noticeIsError ? 'alert' : 'status'}
              >
                <span>{noticeIsError ? '!' : '✓'}</span>
                <span>{notice}</span>
                {noticeAction && (
                  <button
                    type="button"
                    className="notice-action-btn"
                    onClick={noticeAction.onClick}
                  >
                    {noticeAction.label}
                  </button>
                )}
                <button
                  type="button"
                  className="notice-dismiss-btn"
                  onClick={() => {
                    setNotice('');
                    setNoticeAction(null);
                  }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            {settingsOpen ? (
              <SettingsView
                settings={shopSettings}
                busy={busy}
                onSave={saveShopSettings}
                onClose={() => setSettingsOpen(false)}
                onExportBackup={() => void exportBackup()}
                onExportSqlite={() => void exportSqliteBackup()}
                onImportBackup={(mode) => importBackup(mode)}
                onExportCsv={() => void exportCsv()}
                initialTab={settingsTab}
                appVersion={appVersion}
              />
            ) : customersOpen ? (
              <CustomersView
                customers={customers}
                busy={busy}
                selectedKey={selectedCustomerKey}
                onSelectCustomer={setSelectedCustomerKey}
                onNewOrder={startFromHistory}
                onSaveContact={saveCustomerContact}
                onSaveVehicle={saveCustomerVehicle}
                onOpenOrder={(orderId, historyKey) => {
                  const order = orders.find((entry) => entry.id === orderId);
                  if (order) startEdit(order, historyKey);
                }}
              />
            ) : creating ? (
              <form
                id="new-repair-order"
                className="form-layout"
                onSubmit={submitOrder}
                onKeyDown={(event) => {
                  // Saving prints, so Enter in a field must not submit.
                  if (
                    event.key === 'Enter' &&
                    event.target instanceof HTMLInputElement
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <div className="form-main">
                  <section className="form-card">
                    <div className="card-heading">
                      <div className="step-number">01</div>
                      <div>
                        <h2>Customer details</h2>
                        <p>Who is bringing the vehicle in?</p>
                      </div>
                    </div>
                    {!editingId && !duplicateOf && customers.length > 0 && (
                      <CustomerAutofillSearch
                        customers={customers}
                        onSelect={autofillFromCustomer}
                      />
                    )}
                    <div className="form-grid">
                      <Field
                        label="Customer name"
                        name="customerName"
                        value={form.customerName}
                        onChange={updateField}
                        placeholder="Full name"
                        required
                      />
                      <Field
                        label="Business phone"
                        name="phone"
                        value={form.phone}
                        onChange={updateField}
                        placeholder="(630) 555-0123"
                      />
                      <Field
                        label="Customer email"
                        name="email"
                        type="email"
                        value={form.email ?? ''}
                        onChange={updateField}
                        placeholder="customer@example.com"
                      />
                      <div className="field address-toggle-field">
                        <span className="address-toggle-label">
                          Customer address
                        </span>
                        {showAddress || Boolean(form.address?.trim()) ? (
                          <button
                            type="button"
                            className="address-toggle-btn active"
                            onClick={() => {
                              setShowAddress(false);
                              updateField('address', '');
                            }}
                            title="Remove address fields"
                          >
                            <span>−</span> Remove address
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="address-toggle-btn"
                            onClick={() => {
                              focusStreetOnOpen.current = true;
                              setShowAddress(true);
                            }}
                            title="Add optional customer address"
                          >
                            <span>+</span> Add address
                          </button>
                        )}
                      </div>
                      {(showAddress || Boolean(form.address?.trim())) && (
                        <div className="customer-address-panel">
                          <label className="field full-width">
                            <span>Street address</span>
                            <input
                              ref={(input) => {
                                if (input && focusStreetOnOpen.current) {
                                  focusStreetOnOpen.current = false;
                                  input.focus();
                                }
                              }}
                              name="address"
                              type="text"
                              value={form.address}
                              onChange={(e) =>
                                updateField('address', e.target.value)
                              }
                              placeholder="Street address (e.g. 123 Main St, Apt 4)"
                            />
                          </label>
                          <div className="address-csz-grid">
                            <label className="field address-city-field">
                              <span>City</span>
                              <input
                                name="city"
                                type="text"
                                value={form.legacy?.city ?? ''}
                                onChange={(e) =>
                                  updateLegacyField('city', e.target.value)
                                }
                                placeholder="City (e.g. Aurora)"
                              />
                            </label>
                            <label className="field address-state-field">
                              <span>State</span>
                              <input
                                name="state"
                                type="text"
                                value={form.legacy?.state ?? ''}
                                onChange={(e) =>
                                  updateLegacyField('state', e.target.value)
                                }
                                placeholder="IL"
                                maxLength={2}
                              />
                            </label>
                            <label className="field address-zip-field">
                              <span>ZIP code</span>
                              <input
                                name="zip"
                                type="text"
                                value={form.legacy?.zip ?? ''}
                                onChange={(e) =>
                                  updateLegacyField('zip', e.target.value)
                                }
                                placeholder="Zipcode (e.g. 60505)"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="form-card">
                    <div className="card-heading card-heading-with-actions">
                      <div className="card-heading-main">
                        <div className="step-number">02</div>
                        <div>
                          <h2>Vehicle details</h2>
                          <p>Identify the vehicle for this repair.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`switch-vehicle-btn ${matchingCustomerVehicles.length > 1 ? 'has-multiple' : ''}`}
                        onClick={() => setSwitchVehicleOpen(true)}
                        title={
                          matchingCustomerVehicles.length > 1
                            ? `Switch vehicle (${matchingCustomerVehicles.length} available for this customer)`
                            : 'Switch vehicle'
                        }
                        aria-label="Switch vehicle"
                      >
                        <SwitchVehicleIcon />
                        <span>Switch vehicle</span>
                        {matchingCustomerVehicles.length > 1 && (
                          <span className="switch-count-badge">
                            {matchingCustomerVehicles.length}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="form-grid vehicle-grid">
                      <Field
                        label="Year"
                        name="vehicleYear"
                        value={form.vehicleYear}
                        onChange={updateField}
                        placeholder="2021"
                      />
                      <Field
                        label="Make"
                        name="vehicleMake"
                        value={form.vehicleMake}
                        onChange={updateField}
                        placeholder="Toyota"
                      />
                      <Field
                        label="Model"
                        name="vehicleModel"
                        value={form.vehicleModel}
                        onChange={updateField}
                        placeholder="Camry"
                      />
                      <Field
                        label="License plate"
                        name="licensePlate"
                        value={form.licensePlate}
                        onChange={updateField}
                        placeholder="ABC 1234"
                      />
                      <div className="vin-input-group">
                        <div className="vin-label-row">
                          <label htmlFor="field-vin" className="vin-label">
                            Serial number / VIN
                          </label>
                          <button
                            type="button"
                            className="vin-decode-action-btn"
                            onClick={() => void handleDecodeVin(form.vin)}
                            disabled={
                              vinDecoding ||
                              !form.vin ||
                              form.vin.replace(/[^A-Z0-9]/gi, '').length !== 17
                            }
                            title="Auto-fill Year, Make & Model using official NHTSA vehicle database"
                          >
                            {vinDecoding ? (
                              <>
                                <Loader2 size={11} className="spin" />
                                <span>Decoding…</span>
                              </>
                            ) : (
                              <>
                                <Zap size={11} />
                                <span>Decode VIN</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="vin-input-container">
                          <input
                            id="field-vin"
                            name="vin"
                            type="text"
                            value={form.vin}
                            onChange={(e) => {
                              const upper = e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, '');
                              updateField('vin', upper);
                              setVinFeedback(null);
                              if (upper.length === 17) {
                                void handleDecodeVin(upper);
                              }
                            }}
                            placeholder="17-character vehicle ID"
                            maxLength={17}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>
                        {vinFeedback && (
                          <div
                            className={`vin-pill-feedback ${vinFeedback.type}`}
                          >
                            {vinFeedback.type === 'success' ? (
                              <Check size={12} />
                            ) : (
                              <AlertCircle size={12} />
                            )}
                            <span>{vinFeedback.message}</span>
                          </div>
                        )}
                      </div>
                      <Field
                        label="Mileage"
                        name="mileage"
                        value={form.mileage}
                        onChange={updateField}
                        placeholder="Mileage in"
                      />
                    </div>
                  </section>

                  <section className="form-card repair-card">
                    <div className="card-heading">
                      <div className="step-number">03</div>
                      <div>
                        <h2>Repair details</h2>
                        <p>Record the issue and the expected timeline.</p>
                      </div>
                    </div>
                    <div className="repair-top-grid">
                      <div className="repair-date-col">
                        <Field
                          label="Date in"
                          name="dateIn"
                          value={form.dateIn}
                          onChange={updateField}
                          type="date"
                        />
                      </div>
                      <div className="repair-date-col">
                        <Field
                          label="Delivery date"
                          name="datePromised"
                          value={form.datePromised}
                          onChange={updateField}
                          type="date"
                        />
                      </div>
                      <div className="repair-notes-col">
                        <ExpandableCustomerNotes
                          value={form.concerns}
                          onChange={(val) => updateField('concerns', val)}
                        />
                      </div>
                    </div>
                    <WorkOrderCharges
                      charges={form.charges}
                      defaults={shopDefaults}
                      onChange={(charges) =>
                        setForm((current) => ({ ...current, charges }))
                      }
                    />
                    <div className="cost-summary">
                      {(
                        [
                          ['parts', 'Parts'],
                          ['labor', 'Labor'],
                          ['sublet', 'Sublet'],
                          ['fluids', 'Gas, oil & grease'],
                          ['disposal', 'EPA / waste disposal'],
                          ['other', 'Other'],
                        ] as const
                      ).map(([key, label]) => (
                        <span key={key}>
                          {label}
                          <strong className={totals[key] ? '' : 'is-zero'}>
                            ${totals[key].toFixed(2)}
                          </strong>
                        </span>
                      ))}
                      <span>
                        Taxable subtotal
                        <strong className={totals.taxable ? '' : 'is-zero'}>
                          ${totals.taxable.toFixed(2)}
                        </strong>
                      </span>
                      <span>
                        Tax
                        {form.taxRate ? ` (${form.taxRate}%)` : ''}
                        <strong className={totals.tax ? '' : 'is-zero'}>
                          ${totals.tax.toFixed(2)}
                        </strong>
                      </span>
                      <div className="cost-summary-tax-rate">
                        <label
                          htmlFor="summary-tax-rate"
                          className="cost-summary-tax-label"
                        >
                          Tax rate
                        </label>
                        <div className="cost-summary-tax-input-wrap">
                          <input
                            id="summary-tax-rate"
                            name="taxRate"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={form.taxRate ?? ''}
                            onChange={(event) =>
                              updateField('taxRate', event.target.value)
                            }
                            placeholder="8.25"
                            className="cost-summary-tax-input"
                            aria-label="Sales tax rate percentage"
                          />
                          <span className="cost-summary-tax-suffix">%</span>
                        </div>
                      </div>
                    </div>
                    <div className="total-preview">
                      <span>Total amount</span>
                      <strong>${total.toFixed(2)}</strong>
                    </div>
                    <div className="info-note">
                      <span>ⓘ</span> Every line is quantity × unit price. Sales
                      tax is calculated on the lines marked Tax at the rate
                      above, which is remembered for new orders.
                    </div>
                  </section>
                  <LegacyFields
                    value={{ ...defaultLegacy, ...form.legacy }}
                    totals={totals}
                    revisedTotals={revisedTotals}
                    revisedEditor={
                      <WorkOrderCharges
                        variant="compact"
                        charges={form.revisedCharges ?? []}
                        defaults={shopDefaults}
                        onChange={(revisedCharges) =>
                          setForm((current) => ({ ...current, revisedCharges }))
                        }
                        heading="Additional line items"
                        minLines={0}
                        emptyHint="No additional work yet. Add a line only if the job changed."
                      />
                    }
                    onChange={(key, value) =>
                      setForm((current) => ({
                        ...current,
                        legacy: {
                          ...defaultLegacy,
                          ...current.legacy,
                          [key]: value,
                        },
                      }))
                    }
                  />
                </div>
              </form>
            ) : (
              <>
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-top">
                      <span>Open repair orders</span>
                      <span className="metric-icon primary">▦</span>
                    </div>
                    <strong>{String(openOrdersCount).padStart(2, '0')}</strong>
                    <small>Saved on this computer</small>
                  </div>
                  <div
                    className={`metric-card interactive ${dueFilterActive ? 'active-filter' : ''}`}
                    onClick={() => setDueFilterActive(!dueFilterActive)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={dueFilterActive}
                    title="Click to toggle filter for orders due for delivery today or overdue"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDueFilterActive(!dueFilterActive);
                      }
                    }}
                  >
                    <div className="metric-top">
                      <span>Needs your attention</span>
                      <span className="metric-icon amber">⏱</span>
                    </div>
                    <strong>{String(dueTodayCount).padStart(2, '0')}</strong>
                    <small>
                      {dueFilterActive
                        ? 'Showing due or overdue (click to reset)'
                        : 'Delivery today or overdue'}
                    </small>
                  </div>
                  <div className="metric-card accent-card">
                    <span className="accent-spark">✳</span>
                    <div className="accent-content">
                      <strong>Keep the shop moving.</strong>
                      <span>Create a repair order for the next vehicle.</span>
                      <button type="button" onClick={startNewOrder}>
                        Create repair order <b>→</b>
                      </button>
                    </div>
                  </div>
                </div>

                <section className="orders-panel">
                  <div className="orders-header">
                    <div>
                      <div className="section-eyebrow">YOUR SHOP FLOOR</div>
                      <h2>
                        Recent repair orders <span>{orders.length}</span>
                      </h2>
                    </div>
                    <div className="orders-actions">
                      <label className="search-box">
                        <span>⌕</span>
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          aria-label="Search orders by customer name, VIN, license plate, order number, or vehicle"
                          placeholder="Customer, order, VIN or plate…"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="order-filters">
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(event.target.value)
                        }
                      >
                        <option value="">All statuses</option>
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {orderStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Delivery from</span>
                      <input
                        type="date"
                        value={promisedFrom}
                        max={promisedTo || undefined}
                        onChange={(event) =>
                          setPromisedFrom(event.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Delivery through</span>
                      <input
                        type="date"
                        value={promisedTo}
                        min={promisedFrom || undefined}
                        onChange={(event) => setPromisedTo(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Sort</span>
                      <select
                        value={orderSort}
                        onChange={(event) => setOrderSort(event.target.value)}
                      >
                        <option value="newest">Newest first</option>
                        <option value="promised">
                          Delivery date — earliest first
                        </option>
                        <option value="customer">Customer name — A–Z</option>
                      </select>
                    </label>
                    {dueFilterActive && (
                      <span className="active-filter-badge">
                        ⏱ Delivery today or overdue
                        <button
                          type="button"
                          onClick={() => setDueFilterActive(false)}
                          aria-label="Remove attention filter"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {hasOrderFilters && (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setQuery('');
                          setStatusFilter('');
                          setPromisedFrom('');
                          setPromisedTo('');
                          setDueFilterActive(false);
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ORDER</th>
                          <th>CUSTOMER</th>
                          <th>VEHICLE</th>
                          <th className="date-in-column">DATE IN</th>
                          <th>STATUS</th>
                          <th className="estimate-column">ESTIMATE</th>
                          <th className="actions-column">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length ? (
                          sortedOrders.map((order) => (
                            <tr key={order.id}>
                              <td>
                                <div className="order-number-cell">
                                  <strong className="order-id">
                                    {order.orderNumber}
                                  </strong>
                                  {order.lastEmailSent && (
                                    <span
                                      className="order-emailed-badge"
                                      title={`Emailed to ${order.lastEmailSent.recipient} on ${new Date(order.lastEmailSent.sentAt).toLocaleString()}`}
                                    >
                                      ✉ Emailed
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="customer-cell">
                                  <span className="customer-avatar">
                                    {order.customerName
                                      .slice(0, 1)
                                      .toUpperCase()}
                                  </span>
                                  <strong>{order.customerName}</strong>
                                </div>
                              </td>
                              <td>
                                {[
                                  order.vehicleYear,
                                  order.vehicleMake,
                                  order.vehicleModel,
                                ]
                                  .filter(Boolean)
                                  .join(' ') || 'Vehicle details pending'}
                              </td>
                              <td className="date-in-column">
                                {order.dateIn
                                  ? new Date(
                                      `${order.dateIn}T12:00:00`,
                                    ).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                              </td>
                              <td>
                                <div
                                  className={`status-pill status-${normalizeStatus(order.status)}`}
                                >
                                  <i />
                                  <select
                                    aria-label={`Status for ${order.orderNumber}`}
                                    value={normalizeStatus(order.status)}
                                    onChange={(event) =>
                                      void changeStatus(
                                        order,
                                        event.target.value as WorkOrderStatus,
                                      )
                                    }
                                  >
                                    {ORDER_STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {orderStatusLabels[status]}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="status-caret" aria-hidden />
                                </div>
                              </td>
                              <td className="estimate-column">
                                {order.total
                                  ? order.total.toLocaleString('en-US', {
                                      style: 'currency',
                                      currency: 'USD',
                                    })
                                  : '—'}
                              </td>
                              <td className="actions-column">
                                <div className="row-actions">
                                  <button
                                    className="row-action receipt-pdf-action"
                                    aria-label={`Save PDF for ${order.orderNumber}`}
                                    onClick={() => void savePdf(order)}
                                  >
                                    Save PDF
                                  </button>
                                  <button
                                    className="row-action email-order-action"
                                    aria-label={`Email PDF for ${order.orderNumber}`}
                                    onClick={() => openEmailModal(order)}
                                  >
                                    Email
                                  </button>
                                  <button
                                    className="row-action"
                                    aria-label={`Edit ${order.orderNumber}`}
                                    onClick={() => startEdit(order)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="row-action"
                                    aria-label={`Duplicate ${order.orderNumber}`}
                                    onClick={() => startDuplicate(order)}
                                  >
                                    Duplicate
                                  </button>
                                  <button
                                    className="row-action danger"
                                    aria-label={`Delete ${order.orderNumber}`}
                                    onClick={() => setPendingDelete(order)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">
                                <div className="empty-icon">▤</div>
                                <strong>
                                  {hasOrderFilters
                                    ? 'No matching repair orders'
                                    : 'No saved repair orders yet'}
                                </strong>
                                <p>
                                  {hasOrderFilters
                                    ? 'Try changing your search, status, or delivery dates.'
                                    : 'Create a repair order, then save a PDF to print or share.'}
                                </p>
                                {!hasOrderFilters && (
                                  <button
                                    className="primary-button"
                                    onClick={startNewOrder}
                                  >
                                    ＋ New repair order
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <footer className="table-footer">
                    <span>
                      Showing <strong>{filteredOrders.length}</strong> of{' '}
                      <strong>{orders.length}</strong> repair orders
                    </span>
                    <span>
                      Local database <i className="status-dot" />
                    </span>
                  </footer>
                </section>
              </>
            )}
            <footer className="page-footer">
              <span>© 2026 Katia Auto Sales & Repairs · v{appVersion}</span>
              <span>
                Made for the work that keeps you moving <b>✳</b>
              </span>
            </footer>
          </div>
        </main>
        {emailDraft && (
          <EmailOrderModal
            draft={emailDraft}
            sending={emailSending}
            error={emailModalError}
            onChange={(changes) =>
              setEmailDraft((current) =>
                current ? { ...current, ...changes } : current,
              )
            }
            onClose={closeEmailModal}
            onSend={() => void sendEmailDraft()}
            onOpenSettings={() => {
              setEmailDraft(null);
              setSettingsTab('email');
              setSettingsOpen(true);
            }}
          />
        )}
        {pendingDiscard && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setPendingDiscard(null)}
          >
            <div
              aria-labelledby="discard-draft-title"
              aria-modal="true"
              className="modal-card"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-mark">!</div>
              <h2 id="discard-draft-title">Discard this draft?</h2>
              <p>
                This repair order has details that are not saved yet. Leaving
                now will discard them.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  autoFocus
                  onClick={() => setPendingDiscard(null)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={discardDraftAndContinue}
                >
                  Discard draft
                </button>
              </div>
            </div>
          </div>
        )}
        {pendingDelete && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setPendingDelete(null)}
          >
            <div
              aria-labelledby="delete-order-title"
              aria-modal="true"
              className="modal-card"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-mark">!</div>
              <h2 id="delete-order-title">
                Delete {pendingDelete.orderNumber}?
              </h2>
              <p>
                This permanently removes {pendingDelete.customerName}’s repair
                order from this computer. Exported PDFs are not affected.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  autoFocus
                  onClick={() => setPendingDelete(null)}
                >
                  Keep order
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() => void deleteOrder()}
                >
                  {busy ? 'Deleting…' : 'Delete order'}
                </button>
              </div>
            </div>
          </div>
        )}
        {switchVehicleOpen && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setSwitchVehicleOpen(false)}
          >
            <div
              className="modal-card switch-vehicle-modal-card"
              role="dialog"
              aria-labelledby="switch-vehicle-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="switch-vehicle-modal-head">
                <div>
                  <h2 id="switch-vehicle-dialog-title">Switch Vehicle</h2>
                  <p>
                    {matchingCustomer
                      ? `Select a vehicle for ${matchingCustomer.name}`
                      : 'Choose a vehicle for this repair order'}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close-icon-btn"
                  onClick={() => setSwitchVehicleOpen(false)}
                  aria-label="Close dialog"
                >
                  ×
                </button>
              </div>

              {matchingCustomerVehicles.length > 0 ? (
                <div className="switch-vehicle-list">
                  {matchingCustomerVehicles.map((vehicle) => {
                    const isCurrent =
                      form.vin && vehicle.vin
                        ? form.vin.trim().toLowerCase() ===
                          vehicle.vin.trim().toLowerCase()
                        : form.licensePlate && vehicle.licensePlate
                          ? form.licensePlate.trim().toLowerCase() ===
                            vehicle.licensePlate.trim().toLowerCase()
                          : [
                              form.vehicleYear,
                              form.vehicleMake,
                              form.vehicleModel,
                            ]
                              .filter(Boolean)
                              .join(' ')
                              .toLowerCase() === vehicle.label.toLowerCase();

                    return (
                      <div
                        key={vehicle.key}
                        className={`switch-vehicle-item ${isCurrent ? 'is-current' : ''}`}
                        onClick={() => handleSelectVehicle(vehicle)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectVehicle(vehicle);
                          }
                        }}
                      >
                        <div className="switch-vehicle-info">
                          <div className="switch-vehicle-name">
                            <strong>{vehicle.label}</strong>
                            {isCurrent && (
                              <span className="current-vehicle-pill">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="switch-vehicle-meta">
                            {[vehicle.licensePlate, vehicle.vin]
                              .filter(Boolean)
                              .join(' · ') || 'No plate or VIN on file'}
                          </div>
                          {vehicle.orders.length > 0 && (
                            <small className="switch-vehicle-orders">
                              {vehicle.orders.length}{' '}
                              {vehicle.orders.length === 1 ? 'order' : 'orders'}{' '}
                              on file
                              {vehicle.lastVisit
                                ? ` · Last visit ${vehicle.lastVisit}`
                                : ''}
                            </small>
                          )}
                        </div>
                        <button
                          type="button"
                          className="secondary-button switch-select-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectVehicle(vehicle);
                          }}
                        >
                          {isCurrent ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="switch-vehicle-empty">
                  <p>
                    {matchingCustomer
                      ? `${matchingCustomer.name} has no vehicles on file yet.`
                      : 'No customer selected yet. Enter a customer name or pick one from "Autofill from history" above to view their vehicles.'}
                  </p>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSwitchVehicleOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
