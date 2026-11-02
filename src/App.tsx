import ChargeRows from './ChargeRows';
import CustomersView from './Customers';
import CustomerAutofillSearch from './CustomerAutofillSearch';
import ExpandableCustomerNotes from './ExpandableCustomerNotes';
import WorkOrderCharges from './WorkOrderCharges';
import KatiaLogo from './KatiaLogo';
import LegacyFields from './LegacyFields';
import SettingsView, { type SettingsTab } from './SettingsView';
import WindowTitleBar from './WindowTitleBar';
import {
  customerProfiles,
  orderCustomerKey,
  type CustomerContact,
  type CustomerProfile,
  type CustomerVehicle,
} from './customerHistory';
import {
  builtInTaxDefaults,
  chargeTotals,
  defaultLegacy,
  defaultTaxable,
  isPromiseDue,
  normalizeStatus,
  ORDER_STATUSES,
  orderStatusLabels,
  supplementTotals,
  type TaxDefaults,
  type WorkOrderStatus,
} from './workOrder';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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
      kind: 'parts',
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
  charges: [{ ...emptyOrder.charges[0], taxable: defaults.parts }],
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
  const [notice, setNotice] = useState('');
  const [emailModalOrder, setEmailModalOrder] = useState<WorkOrder | null>(
    null,
  );
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCustomNote, setEmailCustomNote] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email?: string;
  } | null>(null);
  const [emailModalError, setEmailModalError] = useState('');

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
      .catch(() => setNotice('Could not load saved dashboard choices.'));
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
      .catch(() => setNotice('Could not remember dashboard choices.'));
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
    void window.repairDesk
      .listCustomerContacts()
      .then(setCustomerContacts)
      .catch(() => undefined);
    void window.repairDesk
      .getSettings()
      .then((settings) => {
        setShopSettings(settings);
        setShopDefaults(settings.defaults);
        setSavedTaxRate(settings.taxRate);
        setForm((current) => ({
          ...current,
          taxRate: current.taxRate || settings.taxRate,
          charges: current.charges.map((line) => ({
            ...line,
            taxable: line.taxable ?? settings.defaults[line.kind],
          })),
          legacy: {
            ...defaultLegacy,
            ...current.legacy,
            city:
              current.legacy?.city || settings.shopCity || defaultLegacy.city,
            state:
              current.legacy?.state ||
              settings.shopState ||
              defaultLegacy.state,
            zip: current.legacy?.zip || settings.shopZip || defaultLegacy.zip,
            terms:
              current.legacy?.terms ||
              settings.defaultTerms ||
              defaultLegacy.terms,
            writtenBy:
              current.legacy?.writtenBy ||
              settings.defaultWrittenBy ||
              defaultLegacy.writtenBy,
            technician:
              current.legacy?.technician ||
              settings.defaultTechnician ||
              defaultLegacy.technician,
            callWhenReady:
              current.legacy?.callWhenReady ||
              settings.defaultCallWhenReady ||
              defaultLegacy.callWhenReady,
            saveOldParts:
              current.legacy?.saveOldParts ||
              settings.defaultSaveOldParts ||
              defaultLegacy.saveOldParts,
          },
        }));
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
        if (pendingDelete) {
          setPendingDelete(null);
        } else if (creating) {
          closeOrderForm();
        } else if (dueFilterActive) {
          setDueFilterActive(false);
        } else if (query) {
          setQuery('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [creating, pendingDelete, dueFilterActive, query]);

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
    () => customerProfiles(orders, customerContacts),
    [orders, customerContacts],
  );
  const totals = chargeTotals(form);
  const revisedTotals = supplementTotals(form);
  const total = totals.total;
  const updateField = (name: keyof WorkOrderInput, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const setQuickPromisedDate = (days: number) => {
    const baseDate = form.dateIn
      ? new Date(`${form.dateIn}T12:00:00`)
      : new Date();
    baseDate.setDate(baseDate.getDate() + days);
    const formatted = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
    updateField('datePromised', formatted);
  };

  function startNewOrder() {
    setNotice('');
    setSettingsOpen(false);
    setCustomersOpen(false);
    setEditingId(null);
    setDuplicateOf(null);
    setReturnCustomerKey(null);
    setForm(blankOrder(savedTaxRate, shopDefaults, shopSettings));
    setCreating(true);
  }

  function openCustomers() {
    setNotice('');
    setSettingsOpen(false);
    setCreating(false);
    setEditingId(null);
    setDuplicateOf(null);
    setReturnCustomerKey(null);
    if (!customersOpen) setSelectedCustomerKey(null);
    setCustomersOpen(true);
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
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openTaxSettings(tab: SettingsTab | unknown = 'shop') {
    const targetTab: SettingsTab =
      typeof tab === 'string' &&
      ['shop', 'taxes', 'email', 'appearance', 'backup'].includes(tab)
        ? (tab as SettingsTab)
        : 'shop';
    setNotice('');
    setCustomersOpen(false);
    setCreating(false);
    setEditingId(null);
    setDuplicateOf(null);
    setReturnCustomerKey(null);
    setSettingsTab(targetTab);
    setSettingsOpen(true);
  }

  function startFromHistory(
    customer: CustomerProfile,
    vehicle?: CustomerVehicle,
  ) {
    setNotice('');
    setSettingsOpen(false);
    setCustomersOpen(false);
    setEditingId(null);
    setDuplicateOf(null);
    setReturnCustomerKey(null);
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
    setSettingsOpen(false);
    setCustomersOpen(false);
    setEditingId(order.id);
    setDuplicateOf(null);
    setReturnCustomerKey(returnCustomer);
    if (returnCustomer) setSelectedCustomerKey(returnCustomer);
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
    const rate = copy.taxRate?.trim() ? copy.taxRate : savedTaxRate;
    setNotice('');
    setSettingsOpen(false);
    setCustomersOpen(false);
    setEditingId(null);
    setDuplicateOf(order);
    setReturnCustomerKey(null);
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
      setNotice('Could not delete this repair order.');
    } finally {
      setBusy(false);
    }
  }

  function closeOrderForm() {
    const returnCustomer = returnCustomerKey;
    setEditingId(null);
    setDuplicateOf(null);
    setForm(blankOrder(savedTaxRate, shopDefaults));
    setCreating(false);
    setNotice('');
    setReturnCustomerKey(null);
    if (returnCustomer) {
      setSelectedCustomerKey(returnCustomer);
      setCustomersOpen(true);
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
      setForm(blankOrder(form.taxRate?.trim() || savedTaxRate, shopDefaults));
      setReturnCustomerKey(null);
      if (returnCustomer) {
        setSelectedCustomerKey(orderCustomerKey(saved, customerContacts));
        setCustomersOpen(true);
      }
      setCreating(false);
      setNotice(
        `${saved.orderNumber} ${editing ? 'updated' : 'saved'} successfully.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not save this repair order.',
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
      setNotice('Could not create the PDF. Please try again.');
    }
  }

  function openEmailModal(order: WorkOrder) {
    setEmailModalOrder(order);
    setEmailModalError('');
    const defaultSubject = `Repair Order ${order.orderNumber} · Katia Auto Sales & Repairs`;
    setEmailSubject(defaultSubject);
    const defaultNote = `Thank you for choosing Katia Auto Sales & Repairs. Attached is the official repair order and invoice (${order.orderNumber}.pdf) for your records.`;
    setEmailCustomNote(defaultNote);
    const contact = customerContacts.find(
      (c) => c.key === orderCustomerKey(order, customerContacts),
    );
    setEmailRecipient(order.email || contact?.email || '');
    void window.repairDesk
      .getGmailStatus()
      .then(setGmailStatus)
      .catch(console.error);
  }

  function closeEmailModal() {
    if (emailSending) return;
    setEmailModalOrder(null);
    setEmailModalError('');
  }

  async function sendOrderEmail() {
    if (!emailModalOrder) return;
    if (!emailRecipient.trim()) {
      setEmailModalError('Please enter a recipient email address.');
      return;
    }
    if (!emailSubject.trim()) {
      setEmailModalError('Please enter an email subject line.');
      return;
    }
    setEmailSending(true);
    setEmailModalError('');
    try {
      const res = await window.repairDesk.sendGmailOrderEmail({
        orderId: emailModalOrder.id,
        recipient: emailRecipient.trim(),
        subject: emailSubject.trim(),
        personalNote: emailCustomNote.trim(),
      });
      if (res.success) {
        setNotice(
          `${emailModalOrder.orderNumber} sent via Gmail to ${emailRecipient.trim()}`,
        );
        setEmailModalOrder(null);
        void window.repairDesk.listWorkOrders().then(setOrders);
      } else {
        setEmailModalError('Could not send email.');
      }
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
      setNotice('Could not export database backup.');
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
      setNotice(msg || 'Could not export SQLite database.');
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

        const applyDefaults = (lines: ChargeLine[]) =>
          lines.map((line) =>
            line.taxable === undefined ||
            line.taxable === defaultTaxable(line.kind, previousDefaults)
              ? {
                  ...line,
                  taxable: defaultTaxable(line.kind, freshSettings.defaults),
                }
              : line,
          );
        setForm((current) => ({
          ...current,
          taxRate: freshSettings.taxRate || current.taxRate,
          charges: applyDefaults(current.charges),
          revisedCharges: applyDefaults(current.revisedCharges ?? []),
          legacy: {
            ...defaultLegacy,
            ...current.legacy,
            city:
              current.legacy?.city ||
              freshSettings.shopCity ||
              defaultLegacy.city,
            state:
              current.legacy?.state ||
              freshSettings.shopState ||
              defaultLegacy.state,
            zip:
              current.legacy?.zip || freshSettings.shopZip || defaultLegacy.zip,
            terms:
              current.legacy?.terms ||
              freshSettings.defaultTerms ||
              defaultLegacy.terms,
            writtenBy:
              current.legacy?.writtenBy ||
              freshSettings.defaultWrittenBy ||
              defaultLegacy.writtenBy,
            technician:
              current.legacy?.technician ||
              freshSettings.defaultTechnician ||
              defaultLegacy.technician,
            callWhenReady:
              current.legacy?.callWhenReady ||
              freshSettings.defaultCallWhenReady ||
              defaultLegacy.callWhenReady,
            saveOldParts:
              current.legacy?.saveOldParts ||
              freshSettings.defaultSaveOldParts ||
              defaultLegacy.saveOldParts,
          },
        }));

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
      setNotice(msg);
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
      setNotice('Could not export to CSV.');
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
      setNotice('Could not update the repair order status.');
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
      const applyDefaults = (lines: ChargeLine[]) =>
        lines.map((line) =>
          line.taxable === undefined ||
          line.taxable === defaultTaxable(line.kind, previous)
            ? { ...line, taxable: defaultTaxable(line.kind, saved.defaults) }
            : line,
        );
      setForm((current) => ({
        ...current,
        taxRate: saved.taxRate || current.taxRate,
        charges: applyDefaults(current.charges),
        revisedCharges: applyDefaults(current.revisedCharges ?? []),
        legacy: {
          ...defaultLegacy,
          ...current.legacy,
          city: current.legacy?.city || saved.shopCity || defaultLegacy.city,
          state:
            current.legacy?.state || saved.shopState || defaultLegacy.state,
          zip: current.legacy?.zip || saved.shopZip || defaultLegacy.zip,
          terms:
            current.legacy?.terms || saved.defaultTerms || defaultLegacy.terms,
          writtenBy:
            current.legacy?.writtenBy ||
            saved.defaultWrittenBy ||
            defaultLegacy.writtenBy,
          technician:
            current.legacy?.technician ||
            saved.defaultTechnician ||
            defaultLegacy.technician,
          callWhenReady:
            current.legacy?.callWhenReady ||
            saved.defaultCallWhenReady ||
            defaultLegacy.callWhenReady,
          saveOldParts:
            current.legacy?.saveOldParts ||
            saved.defaultSaveOldParts ||
            defaultLegacy.saveOldParts,
        },
      }));
      setNotice('Shop configuration applied successfully.');
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not save configuration.',
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
            onClick={() => {
              setSettingsOpen(false);
              setCustomersOpen(false);
              setEditingId(null);
              setDuplicateOf(null);
              setReturnCustomerKey(null);
              setCreating(false);
            }}
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
          <button
            className={`nav-item ${settingsOpen ? 'active' : ''}`}
            onClick={openTaxSettings}
          >
            <span className="nav-icon">⚙</span> Tax & settings
          </button>
          <div className="sidebar-bottom">
            <div className="shop-card">
              <span className="status-dot" />
              <div>
                <strong>Local workspace</strong>
                <small>Saved on this computer</small>
              </div>
            </div>
            <div className="profile">
              <div className="avatar" title="Katia Auto Sales & Repairs">
                <KatiaLogo size={28} color="#ffffff" />
              </div>
              <div>
                <strong>Katia Auto Sales</strong>
                <small>Aurora, Illinois</small>
              </div>
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
              {creating && !settingsOpen && !customersOpen && (
                <div className="order-actions">
                  <div className="order-running-total">
                    <span>Estimated total</span>
                    <strong>${total.toFixed(2)}</strong>
                  </div>
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
                    {busy
                      ? 'Saving…'
                      : editingOrder
                        ? 'Save changes'
                        : 'Save repair order'}{' '}
                    <span>→</span>
                  </button>
                </div>
              )}
              {!creating && !settingsOpen && !customersOpen && (
                <button className="primary-button" onClick={startNewOrder}>
                  <span>＋</span> New repair order
                </button>
              )}
            </section>

            {notice &&
              (() => {
                const isError =
                  /^(could not|failed|error|invalid|missing|unknown|another customer|amounts,|customer name|the sales tax|cannot|backup contains|selected sqlite|unsupported|repair order|database contains)/i.test(
                    notice.trim(),
                  );
                return (
                  <div
                    className={`notice ${isError ? 'error' : ''}`}
                    role={isError ? 'alert' : 'status'}
                  >
                    <span>{isError ? '!' : '✓'}</span>
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
                );
              })()}

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
              />
            ) : customersOpen ? (
              <CustomersView
                customers={customers}
                busy={busy}
                selectedKey={selectedCustomerKey}
                onSelectCustomer={setSelectedCustomerKey}
                onNewOrder={startFromHistory}
                onSaveContact={saveCustomerContact}
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
                      <Field
                        label="Address"
                        name="address"
                        value={form.address}
                        onChange={updateField}
                        placeholder="Street address"
                        wide
                      />
                    </div>
                  </section>

                  <section className="form-card">
                    <div className="card-heading">
                      <div className="step-number">02</div>
                      <div>
                        <h2>Vehicle details</h2>
                        <p>Identify the vehicle for this repair.</p>
                      </div>
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
                      <Field
                        label="Serial number / VIN"
                        name="vin"
                        value={form.vin}
                        onChange={updateField}
                        placeholder="17-character vehicle ID"
                      />
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
                      <div className="repair-date-col promised-date-group">
                        <Field
                          label="Promised date"
                          name="datePromised"
                          value={form.datePromised}
                          onChange={updateField}
                          type="date"
                        />
                        <div className="quick-date-row">
                          <button
                            type="button"
                            className="quick-date-btn"
                            onClick={() => setQuickPromisedDate(0)}
                            title="Same day as Date in"
                          >
                            Same day
                          </button>
                          <button
                            type="button"
                            className="quick-date-btn"
                            onClick={() => setQuickPromisedDate(1)}
                            title="Tomorrow"
                          >
                            Tomorrow
                          </button>
                          <button
                            type="button"
                            className="quick-date-btn"
                            onClick={() => setQuickPromisedDate(3)}
                            title="+3 days"
                          >
                            +3 days
                          </button>
                          <button
                            type="button"
                            className="quick-date-btn"
                            onClick={() => setQuickPromisedDate(7)}
                            title="+1 week"
                          >
                            +1 week
                          </button>
                        </div>
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
                    <Field
                      label="Sales tax rate (%)"
                      name="taxRate"
                      value={form.taxRate ?? ''}
                      onChange={updateField}
                      placeholder="8.25"
                      type="number"
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
                          <strong>${totals[key].toFixed(2)}</strong>
                        </span>
                      ))}
                      <span>
                        Taxable subtotal
                        <strong>${totals.taxable.toFixed(2)}</strong>
                      </span>
                      <span>
                        Tax
                        {form.taxRate ? ` (${form.taxRate}%)` : ''}
                        <strong>${totals.tax.toFixed(2)}</strong>
                      </span>
                    </div>
                    <div className="total-preview">
                      <span>Estimated total</span>
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
                      <ChargeRows
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
                    title="Click to toggle filter for orders promised today or overdue"
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
                        : 'Promised today or overdue'}
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
                      <span>Promised from</span>
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
                      <span>Promised through</span>
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
                          Promised date — earliest first
                        </option>
                        <option value="customer">Customer name — A–Z</option>
                      </select>
                    </label>
                    {dueFilterActive && (
                      <span className="active-filter-badge">
                        ⏱ Promised today or overdue
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
                                    ? 'Try changing your search, status, or promised dates.'
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
              <span>© 2026 Katia Auto Sales & Repairs</span>
              <span>
                Made for the work that keeps you moving <b>✳</b>
              </span>
            </footer>
          </div>
        </main>
        {emailModalOrder && (
          <div
            className="modal-backdrop animate-in"
            role="presentation"
            onClick={closeEmailModal}
          >
            <div
              aria-labelledby="email-order-title"
              aria-modal="true"
              className="modal-card email-modal-dialog"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="email-modal-header">
                <div className="email-modal-icon">✉</div>
                <div>
                  <h2 id="email-order-title">
                    Email {emailModalOrder.orderNumber}
                  </h2>
                  <p>Send invoice PDF to {emailModalOrder.customerName}</p>
                </div>
              </div>

              <div className="email-modal-order-summary">
                <div className="summary-item">
                  <span className="summary-label">Vehicle</span>
                  <strong>
                    {[
                      emailModalOrder.vehicleYear,
                      emailModalOrder.vehicleMake,
                      emailModalOrder.vehicleModel,
                    ]
                      .filter(Boolean)
                      .join(' ') || 'Vehicle on file'}
                  </strong>
                </div>
                <div className="summary-item right">
                  <span className="summary-label">Estimate Total</span>
                  <strong className="summary-total">
                    {emailModalOrder.total
                      ? emailModalOrder.total.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        })
                      : '$0.00'}
                  </strong>
                </div>
              </div>

              {/* Provider indicator badge */}
              <div className="email-provider-status">
                {gmailStatus === null ? (
                  <span className="provider-warning">
                    <span className="status-dot warning" />
                    Checking Gmail connection…
                  </span>
                ) : gmailStatus.connected ? (
                  <span className="provider-ready">
                    <span className="status-dot online" />
                    Sending via connected Gmail (
                    <strong>{gmailStatus.email}</strong>)
                  </span>
                ) : (
                  <div className="gmail-modal-disconnected-banner">
                    <div className="banner-text">
                      <span className="status-dot warning" />
                      <span>
                        Gmail account not connected. Connect your Google account
                        in Settings to send invoices.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="gmail-modal-settings-link"
                      onClick={() => {
                        closeEmailModal();
                        setSettingsTab('email');
                        setSettingsOpen(true);
                      }}
                    >
                      Open Settings →
                    </button>
                  </div>
                )}
              </div>

              <div className="email-modal-inputs">
                <label className="field">
                  <span>Customer Email Address</span>
                  <input
                    type="email"
                    autoFocus
                    placeholder="customer@example.com"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    disabled={emailSending}
                  />
                </label>

                <label className="field">
                  <span>Subject Line</span>
                  <input
                    type="text"
                    placeholder="Repair Order Subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    disabled={emailSending}
                  />
                </label>

                <label className="field">
                  <span>Personal Note / Email Body</span>
                  <textarea
                    rows={3}
                    placeholder="Thank you for bringing your vehicle to Katia Auto Sales & Repairs. Attached is your official repair order..."
                    value={emailCustomNote}
                    onChange={(e) => setEmailCustomNote(e.target.value)}
                    disabled={emailSending}
                  />
                </label>

                <div className="email-modal-attachment-chip">
                  <div className="attachment-icon">📄</div>
                  <div className="attachment-meta">
                    <strong>{emailModalOrder.orderNumber}.pdf</strong>
                    <span>
                      Official Landscape PDF Invoice · Auto-attached via Gmail
                      API
                    </span>
                  </div>
                </div>
              </div>

              {emailModalError && (
                <div className="email-modal-error-box">
                  <span>⚠</span>
                  <span>{emailModalError}</span>
                </div>
              )}

              <p className="email-modal-confirmation-notice">
                Please review details before sending. Clicking send will deliver
                this invoice directly from your connected Google account (
                <strong>{gmailStatus?.email || 'Gmail'}</strong>).
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={emailSending}
                  onClick={closeEmailModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    emailSending ||
                    !emailRecipient.trim() ||
                    !emailSubject.trim() ||
                    !gmailStatus?.connected
                  }
                  onClick={() => void sendOrderEmail()}
                >
                  {emailSending
                    ? 'Sending via Gmail API…'
                    : 'Send Invoice via Gmail'}
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
      </div>
    </div>
  );
}

export default App;
