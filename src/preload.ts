import type { BackupImportMode } from './backupService';
import type { CustomerContact } from './customerHistory';
import {
  type DashboardPreferences,
  type EmailSettings,
  type TaxSettings,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderStatus,
} from './workOrder';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('repairDesk', {
  listWorkOrders: () => ipcRenderer.invoke('work-orders:list'),
  listCustomerContacts: () => ipcRenderer.invoke('customer-contacts:list'),
  saveCustomerContact: (contact: CustomerContact) =>
    ipcRenderer.invoke('customer-contacts:save', contact),
  createWorkOrder: (input: WorkOrderInput) =>
    ipcRenderer.invoke('work-orders:create', input),
  updateWorkOrder: (id: string, input: WorkOrderInput) =>
    ipcRenderer.invoke('work-orders:update', id, input),
  deleteWorkOrder: (id: string) => ipcRenderer.invoke('work-orders:delete', id),
  setWorkOrderStatus: (id: string, status: WorkOrderStatus) =>
    ipcRenderer.invoke('work-orders:set-status', id, status),
  saveWorkOrderPdf: (order: WorkOrder) =>
    ipcRenderer.invoke('work-orders:print-pdf', order),
  openPath: (targetPath: string) =>
    ipcRenderer.invoke('shell:open-path', targetPath),
  exportBackupJson: () => ipcRenderer.invoke('backup:export-json'),
  exportBackupSqlite: () => ipcRenderer.invoke('backup:export-sqlite'),
  importBackup: (mode?: BackupImportMode) =>
    ipcRenderer.invoke('backup:import', mode),
  getDatabaseInfo: () => ipcRenderer.invoke('backup:get-db-info'),
  exportOrdersCsv: () => ipcRenderer.invoke('backup:export-csv'),
  getDashboardPreferences: () => ipcRenderer.invoke('dashboard:get'),
  saveDashboardPreferences: (preferences: DashboardPreferences) =>
    ipcRenderer.invoke('dashboard:save', preferences),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: TaxSettings) =>
    ipcRenderer.invoke('settings:save', settings),
  getEmailSettings: () => ipcRenderer.invoke('email-settings:get'),
  saveEmailSettings: (settings: EmailSettings) =>
    ipcRenderer.invoke('email-settings:save', settings),
  sendTestEmail: (recipientEmail: string, settings?: EmailSettings) =>
    ipcRenderer.invoke('email:send-test', recipientEmail, settings),
  sendOrderEmail: (
    order: WorkOrder,
    recipientEmail: string,
    customMessage?: string,
  ) =>
    ipcRenderer.invoke(
      'email:send-order-pdf',
      order,
      recipientEmail,
      customMessage,
    ),
  getGmailStatus: () => ipcRenderer.invoke('gmail:status'),
  connectGmail: (credentials?: { clientId: string; clientSecret: string }) =>
    ipcRenderer.invoke('gmail:connect', credentials),
  disconnectGmail: () => ipcRenderer.invoke('gmail:disconnect'),
  saveGmailCredentials: (credentials: {
    clientId: string;
    clientSecret: string;
  }) => ipcRenderer.invoke('gmail:save-credentials', credentials),
  sendGmailTestEmail: (recipientEmail: string) =>
    ipcRenderer.invoke('gmail:send-test', recipientEmail),
  sendGmailOrderEmail: (options: {
    orderId: string;
    recipient: string;
    subject: string;
    personalNote?: string;
  }) => ipcRenderer.invoke('gmail:send-order', options),
  platform: process.platform,
  setTitleBarOverlay: (options: {
    color: string;
    symbolColor: string;
    height?: number;
  }) => ipcRenderer.invoke('window:set-title-bar-overlay', options),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: unknown, isMax: boolean) => callback(isMax);
    ipcRenderer.on('window:maximized-change', listener);
    return () => {
      ipcRenderer.removeListener('window:maximized-change', listener);
    };
  },
});
