import {
  normalizeStatus,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderStatus,
} from './workOrder';

type VehicleFields = Pick<
  WorkOrderInput,
  'vehicleYear' | 'vehicleMake' | 'vehicleModel' | 'vin' | 'licensePlate'
>;

export type HistoryOrder = {
  id: string;
  orderNumber: string;
  dateIn: string;
  datePromised: string;
  status: WorkOrderStatus;
  total: number;
  vehicleKey: string;
  vehicleLabel: string;
};

export type CustomerVehicle = VehicleFields & {
  key: string;
  label: string;
  orders: HistoryOrder[];
  lastVisit: string;
};

export type CustomerProfile = {
  key: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  vehicles: CustomerVehicle[];
  orders: HistoryOrder[];
  lastVisit: string;
  totalSpent: number;
};

export type CustomerContact = {
  key: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
};

export const customerKey = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

export function orderCustomerKey(
  order: Pick<WorkOrderInput, 'customerKey' | 'customerName'>,
  contacts: CustomerContact[] = [],
) {
  if (order.customerKey) return order.customerKey;
  const key = customerKey(order.customerName);
  return (
    contacts.find((contact) => contact.key === key)?.key ??
    contacts.find((contact) => customerKey(contact.name) === key)?.key ??
    key
  );
}

export function filterCustomers(customers: CustomerProfile[], query: string) {
  const text = customerKey(query);
  if (!text) return customers;
  const code = text.replace(/[^a-z0-9]/g, '');
  return customers.filter(
    (customer) =>
      customerKey(customer.name).includes(text) ||
      customer.email.toLowerCase().includes(text) ||
      [
        customer.phone,
        ...customer.vehicles.flatMap((vehicle) => [
          vehicle.vin,
          vehicle.licensePlate,
        ]),
      ].some(
        (value) =>
          value.toLowerCase().includes(text) ||
          (Boolean(code) &&
            value
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .includes(code)),
      ),
  );
}

export const vehicleLabel = (vehicle: VehicleFields) =>
  [vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ') ||
  vehicle.licensePlate.trim() ||
  'Vehicle details pending';

const compactCode = (value: string) =>
  value.replace(/[\s-]+/g, '').toUpperCase();

const vehicleKey = (vehicle: VehicleFields) => {
  const vin = compactCode(vehicle.vin);
  if (vin) return `vin:${vin}`;
  const plate = compactCode(vehicle.licensePlate);
  if (plate) return `plate:${plate}`;
  const label = [vehicle.vehicleYear, vehicle.vehicleMake, vehicle.vehicleModel]
    .join(' ')
    .trim()
    .toLowerCase();
  return label ? `model:${label}` : 'model:unknown';
};

const visitDate = (order: WorkOrder) =>
  order.dateIn || order.createdAt.slice(0, 10);

export function customerProfiles(
  orders: WorkOrder[],
  contacts: CustomerContact[] = [],
): CustomerProfile[] {
  const contactByKey = new Map(
    contacts.map((contact) => [contact.key, contact]),
  );
  const profiles = new Map<
    string,
    { profile: CustomerProfile; vehicles: Map<string, CustomerVehicle> }
  >();

  for (const order of orders) {
    const name = order.customerName.trim();
    if (!name) continue;
    const key = orderCustomerKey(order, contacts);
    let entry = profiles.get(key);
    if (!entry) {
      entry = {
        profile: {
          key,
          name,
          phone: '',
          email: '',
          address: '',
          vehicles: [],
          orders: [],
          lastVisit: '',
          totalSpent: 0,
        },
        vehicles: new Map(),
      };
      profiles.set(key, entry);
    }
    const { profile, vehicles } = entry;

    profile.totalSpent =
      Math.round((profile.totalSpent + (order.total || 0)) * 100) / 100;

    if (!profile.phone && order.phone.trim())
      profile.phone = order.phone.trim();
    if (!profile.email && order.email?.trim())
      profile.email = order.email.trim();
    if (!profile.address && order.address.trim())
      profile.address = order.address.trim();

    const keyOfVehicle = vehicleKey(order);
    let vehicle = vehicles.get(keyOfVehicle);
    if (!vehicle) {
      vehicle = {
        key: keyOfVehicle,
        vehicleYear: '',
        vehicleMake: '',
        vehicleModel: '',
        vin: '',
        licensePlate: '',
        label: '',
        orders: [],
        lastVisit: '',
      };
      vehicles.set(keyOfVehicle, vehicle);
      profile.vehicles.push(vehicle);
    }
    for (const field of [
      'vehicleYear',
      'vehicleMake',
      'vehicleModel',
      'vin',
      'licensePlate',
    ] as const) {
      if (!vehicle[field] && order[field].trim())
        vehicle[field] = order[field].trim();
    }
    vehicle.label = vehicleLabel(vehicle);

    const history: HistoryOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      dateIn: order.dateIn,
      datePromised: order.datePromised,
      status: normalizeStatus(order.status),
      total: order.total,
      vehicleKey: keyOfVehicle,
      vehicleLabel: vehicle.label,
    };
    profile.orders.push(history);
    vehicle.orders.push(history);

    const visit = visitDate(order);
    if (!profile.lastVisit) profile.lastVisit = visit;
    if (!vehicle.lastVisit) vehicle.lastVisit = visit;
  }

  return [...profiles.values()].map(({ profile }) => {
    const contact = contactByKey.get(profile.key);
    if (contact) {
      profile.name = contact.name || profile.name;
      profile.phone = contact.phone;
      profile.email = contact.email || profile.email;
      profile.address = contact.address;
    }
    return profile;
  });
}
