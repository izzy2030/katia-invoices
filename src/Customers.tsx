import {
  filterCustomers,
  type CustomerContact,
  type CustomerProfile,
  type CustomerVehicle,
} from './customerHistory';
import { orderStatusLabels } from './workOrder';
import { decodeVin } from './vinDecoder';
import { useState, type FormEvent } from 'react';

type Props = {
  customers: CustomerProfile[];
  busy: boolean;
  selectedKey: string | null;
  onSelectCustomer: (key: string) => void;
  onNewOrder: (customer: CustomerProfile, vehicle?: CustomerVehicle) => void;
  onSaveContact: (contact: CustomerContact) => Promise<boolean>;
  onSaveVehicle?: (vehicle: {
    customerKey: string;
    year: string;
    make: string;
    model: string;
    licensePlate: string;
    vin: string;
    mileage: string;
  }) => Promise<boolean>;
  onOpenOrder: (orderId: string, customerKey: string) => void;
};

const day = (value: string) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?';

function NewOrderButton({
  customer,
  vehicle,
  subtle = false,
  onNewOrder,
}: {
  customer: CustomerProfile;
  vehicle?: CustomerVehicle;
  subtle?: boolean;
  onNewOrder: Props['onNewOrder'];
}) {
  const target = vehicle ? `${vehicle.label}` : 'the most recent vehicle';
  return (
    <button
      type="button"
      className={`new-order-icon ${subtle ? 'subtle' : ''}`}
      aria-label={`Start a new repair order for ${customer.name} — ${target}`}
      title={`New repair order for ${target}`}
      onClick={() => onNewOrder(customer, vehicle)}
    >
      ＋
    </button>
  );
}

function CustomersView({
  customers,
  busy,
  selectedKey,
  onSelectCustomer,
  onNewOrder,
  onSaveContact,
  onSaveVehicle,
  onOpenOrder,
}: Props) {
  const [query, setQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<{
    customerKey: string;
    vehicleKey: string;
  } | null>(null);
  const matches = filterCustomers(customers, query);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState('');
  const selected =
    matches.find((customer) => customer.key === selectedKey) ?? matches[0];
  const historyVehicle =
    historyFilter?.customerKey === selected?.key
      ? selected?.vehicles.find(
          (vehicle) => vehicle.key === historyFilter?.vehicleKey,
        )
      : undefined;
  const historyOrders = historyVehicle?.orders ?? selected?.orders ?? [];

  async function handleAddVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const action = submitter?.value || 'save';

    const year = String(data.get('year') ?? '').trim();
    const make = String(data.get('make') ?? '').trim();
    const model = String(data.get('model') ?? '').trim();
    const licensePlate = String(data.get('licensePlate') ?? '').trim();
    const vin = String(data.get('vin') ?? '').trim();
    const mileage = String(data.get('mileage') ?? '').trim();

    if (!year || !make || !model) {
      setVehicleError('Please provide Year, Make, and Model.');
      return;
    }

    setSavingVehicle(true);
    setVehicleError('');

    const saved = onSaveVehicle
      ? await onSaveVehicle({
          customerKey: selected.key,
          year,
          make,
          model,
          licensePlate,
          vin,
          mileage,
        })
      : true;

    setSavingVehicle(false);

    if (saved) {
      setAddingVehicle(false);
      if (action === 'saveAndOrder') {
        const vKey = vin
          ? `vin:${vin.replace(/[\s-]+/g, '').toUpperCase()}`
          : licensePlate
            ? `plate:${licensePlate.replace(/[\s-]+/g, '').toUpperCase()}`
            : `custom:${Date.now()}`;
        onNewOrder(selected, {
          key: vKey,
          vehicleYear: year,
          vehicleMake: make,
          vehicleModel: model,
          vin,
          licensePlate,
          label: `${year} ${make} ${model}`,
          orders: [],
          lastVisit: '',
        });
      }
    }
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setSavingContact(true);
    const saved = await onSaveContact({
      key: selected.key,
      name: String(data.get('name') ?? ''),
      phone: String(data.get('phone') ?? ''),
      email: String(data.get('email') ?? ''),
      address: String(data.get('address') ?? ''),
    });
    setSavingContact(false);
    if (saved) setEditingContact(false);
  }

  if (!customers.length) {
    return (
      <section className="customer-empty">
        <div className="empty-icon">☺</div>
        <strong>No customer history yet</strong>
        <p>
          Save a repair order and its customer, vehicle, and visits will collect
          here for next time.
        </p>
      </section>
    );
  }

  return (
    <section className="customers-panel">
      <aside className="customer-index">
        <div className="customer-index-head">
          <span>CUSTOMERS</span>
          <strong>{matches.length}</strong>
        </div>
        <label className="field customer-search">
          <span>Search customers</span>
          <input
            type="search"
            value={query}
            placeholder="Name, phone, VIN, or plate…"
            onChange={(event) => {
              setEditingContact(false);
              setAddingVehicle(false);
              setVehicleError('');
              setHistoryFilter(null);
              setQuery(event.target.value);
            }}
          />
        </label>
        <div className="customer-list">
          {matches.map((customer) => (
            <button
              type="button"
              key={customer.key}
              className={`customer-list-item ${
                customer.key === selected.key ? 'selected' : ''
              }`}
              onClick={() => {
                setEditingContact(false);
                setAddingVehicle(false);
                setVehicleError('');
                setHistoryFilter(null);
                onSelectCustomer(customer.key);
              }}
            >
              <span className="avatar">{initial(customer.name)}</span>
              <span className="customer-list-text">
                <strong>{customer.name}</strong>
                <small>
                  {customer.phone || 'No phone on file'} ·{' '}
                  {customer.orders.length}{' '}
                  {customer.orders.length === 1 ? 'order' : 'orders'}
                </small>
              </span>
              <span className="customer-list-arrow">›</span>
            </button>
          ))}
        </div>
      </aside>

      {selected ? (
        <div className="customer-detail">
          <section
            className={`customer-hero ${editingContact ? 'contact-editing' : ''}`}
          >
            <div className="customer-hero-main">
              <span className="avatar large">{initial(selected.name)}</span>
              <div>
                <h2>{selected.name}</h2>
                {editingContact ? (
                  <form
                    key={selected.key}
                    className="contact-editor"
                    aria-label={`Contact details for ${selected.name}`}
                    onSubmit={saveContact}
                  >
                    <label className="field full-width">
                      <span>Customer name</span>
                      <input
                        name="name"
                        defaultValue={selected.name}
                        required
                        autoFocus
                        disabled={savingContact || busy}
                      />
                    </label>
                    <label className="field">
                      <span>Business phone</span>
                      <input
                        name="phone"
                        defaultValue={selected.phone}
                        placeholder="(630) 555-0123"
                        disabled={savingContact || busy}
                      />
                    </label>
                    <label className="field">
                      <span>Email address</span>
                      <input
                        type="email"
                        name="email"
                        defaultValue={selected.email}
                        placeholder="customer@example.com"
                        disabled={savingContact || busy}
                      />
                    </label>
                    <label className="field">
                      <span>Address</span>
                      <input
                        name="address"
                        defaultValue={selected.address}
                        placeholder="Street address"
                        disabled={savingContact || busy}
                      />
                    </label>
                    <div className="contact-editor-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={savingContact || busy}
                        onClick={() => setEditingContact(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={savingContact || busy}
                      >
                        {savingContact ? 'Saving…' : 'Save details'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="customer-contact-row">
                    <p>
                      {selected.phone || 'No phone on file'}
                      {selected.email ? ` · ${selected.email}` : ''}
                      {selected.address ? ` · ${selected.address}` : ''}
                    </p>
                    <button
                      type="button"
                      className="contact-edit-button"
                      aria-label={`Edit contact details for ${selected.name}`}
                      onClick={() => setEditingContact(true)}
                    >
                      Edit details
                    </button>
                  </div>
                )}
                <div className="customer-facts">
                  <span>
                    <strong>{selected.vehicles.length}</strong>{' '}
                    {selected.vehicles.length === 1 ? 'vehicle' : 'vehicles'}
                  </span>
                  <span>
                    <strong>{selected.orders.length}</strong>{' '}
                    {selected.orders.length === 1 ? 'order' : 'orders'}
                  </span>
                  <span>
                    Last visit <strong>{day(selected.lastVisit)}</strong>
                  </span>
                  <span>
                    Total spend{' '}
                    <strong>
                      $
                      {(selected.totalSpent ?? 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
            {!editingContact && (
              <NewOrderButton
                customer={selected}
                vehicle={selected.vehicles[0]}
                onNewOrder={onNewOrder}
              />
            )}
          </section>

          <section className="customer-section">
            <div className="customer-section-head">
              <div className="customer-section-title">
                <h3>Vehicles</h3>
                <span>{selected.vehicles.length}</span>
              </div>
              <button
                type="button"
                className="add-vehicle-btn"
                onClick={() => {
                  setVehicleError('');
                  setAddingVehicle(true);
                }}
              >
                + Add Vehicle
              </button>
            </div>
            {selected.vehicles.length === 0 ? (
              <div className="vehicle-empty-state">
                <p>No vehicles on file for {selected.name}.</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setVehicleError('');
                    setAddingVehicle(true);
                  }}
                >
                  + Add Vehicle
                </button>
              </div>
            ) : (
              <div className="vehicle-cards">
                {selected.vehicles.map((vehicle) => (
                  <div className="vehicle-card" key={vehicle.key}>
                    <div>
                      <strong>{vehicle.label}</strong>
                      <small>
                        {[vehicle.licensePlate, vehicle.vin]
                          .filter(Boolean)
                          .join(' · ') || 'No plate or VIN on file'}
                      </small>
                      <span>
                        {vehicle.orders.length}{' '}
                        {vehicle.orders.length === 1 ? 'order' : 'orders'} ·
                        Last {day(vehicle.lastVisit)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="customer-section">
            <div className="customer-section-head">
              <h3>Repair history</h3>
              <span>{historyOrders.length}</span>
            </div>
            <label className="field history-vehicle-filter">
              <span>Filter history by vehicle</span>
              <select
                value={historyVehicle?.key ?? ''}
                onChange={(event) =>
                  setHistoryFilter(
                    event.target.value
                      ? {
                          customerKey: selected.key,
                          vehicleKey: event.target.value,
                        }
                      : null,
                  )
                }
              >
                <option value="">All vehicles</option>
                {selected.vehicles.map((vehicle) => (
                  <option key={vehicle.key} value={vehicle.key}>
                    {vehicle.label}
                    {vehicle.licensePlate || vehicle.vin
                      ? ` — ${vehicle.licensePlate || vehicle.vin}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>DATE</th>
                    <th>VEHICLE</th>
                    <th>STATUS</th>
                    <th>ESTIMATE</th>
                  </tr>
                </thead>
                <tbody>
                  {historyOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="history-row"
                      title={`Open ${order.orderNumber} in the editor`}
                      onClick={() => onOpenOrder(order.id, selected.key)}
                    >
                      <td>
                        <button
                          type="button"
                          className="history-order-button"
                          aria-label={`Open ${order.orderNumber} in the editor`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenOrder(order.id, selected.key);
                          }}
                        >
                          {order.orderNumber}
                        </button>
                      </td>
                      <td>{day(order.dateIn)}</td>
                      <td>{order.vehicleLabel}</td>
                      <td>
                        <span
                          className={`status-pill status-static status-${order.status}`}
                        >
                          <i />
                          {orderStatusLabels[order.status]}
                        </span>
                      </td>
                      <td>
                        {order.total ? `$${order.total.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <section className="customer-empty" role="status">
          <strong>No matching customers</strong>
          <p>Try a different name, phone number, VIN, or license plate.</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setQuery('')}
          >
            Clear search
          </button>
        </section>
      )}

      {addingVehicle && selected && (
        <div
          className="modal-backdrop"
          onClick={() => setAddingVehicle(false)}
          role="presentation"
        >
          <div
            className="modal-card add-vehicle-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="add-vehicle-dialog-title"
          >
            <div className="add-vehicle-modal-head">
              <div>
                <h2 id="add-vehicle-dialog-title">Add Vehicle</h2>
                <p>
                  Add a new car for <strong>{selected.name}</strong>
                </p>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setAddingVehicle(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddVehicle}>
              <div className="form-grid add-vehicle-grid">
                <label className="field">
                  <span>Year *</span>
                  <input
                    name="year"
                    type="text"
                    required
                    placeholder="e.g. 2024"
                    defaultValue={new Date().getFullYear()}
                    autoFocus
                  />
                </label>
                <label className="field">
                  <span>Make *</span>
                  <input
                    name="make"
                    type="text"
                    required
                    placeholder="e.g. Toyota"
                  />
                </label>
                <label className="field">
                  <span>Model *</span>
                  <input
                    name="model"
                    type="text"
                    required
                    placeholder="e.g. Camry"
                  />
                </label>
                <label className="field">
                  <span>License plate</span>
                  <input
                    name="licensePlate"
                    type="text"
                    placeholder="e.g. ABC 1234"
                  />
                </label>
                <label className="field full-width">
                  <span>VIN / Serial number</span>
                  <input
                    name="vin"
                    type="text"
                    placeholder="17-character VIN (auto-decodes)"
                    maxLength={17}
                    onChange={(e) => {
                      const val = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '');
                      e.target.value = val;
                      if (val.length === 17) {
                        const formEl = e.target.form;
                        if (formEl) {
                          void decodeVin(val)
                            .then((decoded) => {
                              const yearEl = formEl.elements.namedItem(
                                'year',
                              ) as HTMLInputElement | null;
                              const makeEl = formEl.elements.namedItem(
                                'make',
                              ) as HTMLInputElement | null;
                              const modelEl = formEl.elements.namedItem(
                                'model',
                              ) as HTMLInputElement | null;
                              if (yearEl && decoded.year)
                                yearEl.value = decoded.year;
                              if (makeEl && decoded.make)
                                makeEl.value = decoded.make;
                              if (modelEl && decoded.model)
                                modelEl.value = decoded.model;
                            })
                            .catch(() => undefined);
                        }
                      }
                    }}
                  />
                </label>
                <label className="field full-width">
                  <span>Mileage</span>
                  <input name="mileage" type="text" placeholder="e.g. 45,000" />
                </label>
              </div>

              {vehicleError && (
                <div className="vehicle-modal-error">{vehicleError}</div>
              )}

              <div className="modal-actions add-vehicle-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAddingVehicle(false)}
                  disabled={savingVehicle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  name="action"
                  value="save"
                  className="secondary-button save-vehicle-btn"
                  disabled={savingVehicle}
                >
                  {savingVehicle ? 'Saving…' : 'Save Vehicle'}
                </button>
                <button
                  type="submit"
                  name="action"
                  value="saveAndOrder"
                  className="primary-button"
                  disabled={savingVehicle}
                >
                  {savingVehicle ? 'Saving…' : 'Save & Start Order →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default CustomersView;
