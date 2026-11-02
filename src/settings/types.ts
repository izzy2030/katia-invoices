import type { BackupImportMode, BackupImportResult } from '../backupService';
import type { ReceiptStyle, TaxDefaults } from '../workOrder';

export type SettingsTab =
  | 'shop'
  | 'presets'
  | 'taxes'
  | 'email'
  | 'appearance'
  | 'backup';

export interface GmailStatus {
  connected: boolean;
  email?: string;
  needsReconnect?: boolean;
  hasClientCredentials: boolean;
  clientId?: string;
}

export interface SettingsTabItem {
  id: SettingsTab;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
}

export interface ShopTabProps {
  shopName: string;
  setShopName: (v: string) => void;
  shopPhone: string;
  setShopPhone: (v: string) => void;
  shopAddress: string;
  setShopAddress: (v: string) => void;
  shopCity: string;
  setShopCity: (v: string) => void;
  shopState: string;
  setShopState: (v: string) => void;
  shopZip: string;
  setShopZip: (v: string) => void;
  nextOrderNum: string;
  setNextOrderNum: (v: string) => void;
  defaultTerms: string;
  setDefaultTerms: (v: string) => void;
  defaultWrittenBy: string;
  setDefaultWrittenBy: (v: string) => void;
  defaultTechnician: string;
  setDefaultTechnician: (v: string) => void;
  defaultCallWhenReady: string;
  setDefaultCallWhenReady: (v: string) => void;
  defaultSaveOldParts: string;
  setDefaultSaveOldParts: (v: string) => void;
  receiptStyle: ReceiptStyle;
  setReceiptStyle: (v: ReceiptStyle) => void;
  busy: boolean;
  onSave: () => Promise<void>;
  saved: boolean;
}

export interface TaxesTabProps {
  taxRate: string;
  setTaxRate: (v: string) => void;
  defaults: TaxDefaults;
  setDefaults: React.Dispatch<React.SetStateAction<TaxDefaults>>;
  busy: boolean;
  onSave: () => Promise<void>;
  saved: boolean;
}

export interface GmailTabProps {
  gmailStatus: GmailStatus | null;
  gmailAuthLoading: boolean;
  gmailError: string;
  oauthClientId: string;
  setOauthClientId: (v: string) => void;
  oauthClientSecret: string;
  setOauthClientSecret: (v: string) => void;
  showOAuthCredentials: boolean;
  setShowOAuthCredentials: React.Dispatch<React.SetStateAction<boolean>>;
  credentialsSaved: boolean;
  gmailTestEmail: string;
  setGmailTestEmail: (v: string) => void;
  gmailTestLoading: boolean;
  gmailTestResult: {
    status: 'idle' | 'success' | 'error';
    message: string;
  };
  onConnectGmail: () => Promise<void>;
  onDisconnectGmail: () => Promise<void>;
  onSaveOAuthCredentials: () => Promise<void>;
  onSendGmailTest: () => Promise<void>;
}

export interface AppearanceTabProps {
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

export interface BackupTabProps {
  busy: boolean;
  onExportBackup?: () => void;
  onExportSqlite?: () => void;
  onImportBackup?: (
    mode: BackupImportMode,
  ) => Promise<BackupImportResult | undefined>;
  onExportCsv?: () => void;
}
