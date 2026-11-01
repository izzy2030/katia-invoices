declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

declare module '*.css';

type ChargeLine = import('./workOrder').ChargeLine;
type TaxSettings = import('./workOrder').TaxSettings;
type EmailSettings = import('./workOrder').EmailSettings;
type EmailSendResult = import('./workOrder').EmailSendResult;
type WorkOrderInput = import('./workOrder').WorkOrderInput;
type WorkOrder = import('./workOrder').WorkOrder;
type WorkOrderStatus = import('./workOrder').WorkOrderStatus;
type CustomerContact = import('./customerHistory').CustomerContact;

interface Window {
  repairDesk: {
    listWorkOrders: () => Promise<WorkOrder[]>;
    listCustomerContacts: () => Promise<CustomerContact[]>;
    saveCustomerContact: (contact: CustomerContact) => Promise<CustomerContact>;
    createWorkOrder: (input: WorkOrderInput) => Promise<WorkOrder>;
    updateWorkOrder: (id: string, input: WorkOrderInput) => Promise<WorkOrder>;
    deleteWorkOrder: (id: string) => Promise<boolean>;
    setWorkOrderStatus: (
      id: string,
      status: WorkOrderStatus,
    ) => Promise<WorkOrder>;
    saveWorkOrderPdf: (
      order: WorkOrder,
    ) => Promise<{ saved: boolean; filePath?: string } | boolean>;
    openPath: (targetPath: string) => Promise<boolean>;
    exportBackupJson: () => Promise<boolean>;
    exportOrdersCsv: () => Promise<boolean>;
    getDashboardPreferences: () => Promise<
      import('./workOrder').DashboardPreferences
    >;
    saveDashboardPreferences: (
      preferences: import('./workOrder').DashboardPreferences,
    ) => Promise<import('./workOrder').DashboardPreferences>;
    getSettings: () => Promise<TaxSettings>;
    saveSettings: (settings: TaxSettings) => Promise<TaxSettings>;
    getEmailSettings: () => Promise<EmailSettings>;
    saveEmailSettings: (settings: EmailSettings) => Promise<EmailSettings>;
    sendTestEmail: (
      recipientEmail: string,
      settings?: EmailSettings,
    ) => Promise<EmailSendResult>;
    sendOrderEmail: (
      order: WorkOrder,
      recipientEmail: string,
      customMessage?: string,
    ) => Promise<EmailSendResult>;
    getGmailStatus: () => Promise<{
      connected: boolean;
      email?: string;
      hasClientCredentials: boolean;
      clientId?: string;
    }>;
    connectGmail: (credentials?: {
      clientId: string;
      clientSecret: string;
    }) => Promise<{ success: boolean; email: string }>;
    disconnectGmail: () => Promise<{ success: boolean }>;
    saveGmailCredentials: (credentials: {
      clientId: string;
      clientSecret: string;
    }) => Promise<boolean>;
    sendGmailTestEmail: (
      recipientEmail: string,
    ) => Promise<{ success: boolean; messageId: string; senderEmail: string }>;
    sendGmailOrderEmail: (options: {
      orderId: string;
      recipient: string;
      subject: string;
      personalNote?: string;
    }) => Promise<{ success: boolean; messageId: string; senderEmail: string }>;
  };
}
