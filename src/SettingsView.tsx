import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Store,
  Sparkles,
  Percent,
  Mail,
  Palette,
  Download,
} from 'lucide-react';
import type { BackupImportMode, BackupImportResult } from './backupService';
import type { ReceiptStyle, TaxDefaults, TaxSettings } from './workOrder';
import type {
  SettingsTab,
  SettingsTabItem,
  GmailStatus,
} from './settings/types';
import ShopTab from './settings/ShopTab';
import PresetsTab from './settings/PresetsTab';
import TaxesTab from './settings/TaxesTab';
import GmailTab from './settings/GmailTab';
import AppearanceTab from './settings/AppearanceTab';
import BackupsTab from './settings/BackupsTab';

export type { SettingsTab };

interface SettingsViewProps {
  settings: TaxSettings;
  busy: boolean;
  onSave: (settings: TaxSettings) => Promise<boolean | void>;
  onClose: () => void;
  onExportBackup?: () => void;
  onExportSqlite?: () => void;
  onImportBackup?: (
    mode: BackupImportMode,
  ) => Promise<BackupImportResult | undefined>;
  onExportCsv?: () => void;
  initialTab?: SettingsTab;
  onPresetsChanged?: () => void;
  appVersion?: string;
}

const TABS: SettingsTabItem[] = [
  {
    id: 'shop',
    title: 'Shop Profile',
    subtitle: 'Identity & Defaults',
    icon: Store,
    colorClass: 'color-blue',
  },
  {
    id: 'presets',
    title: 'Presets & Catalog',
    subtitle: 'Body Shop Jobs & Parts',
    icon: Sparkles,
    colorClass: 'color-amber',
  },
  {
    id: 'taxes',
    title: 'Taxes & Rates',
    subtitle: 'Sales Tax & Rules',
    icon: Percent,
    colorClass: 'color-teal',
  },
  {
    id: 'email',
    title: 'Email & Delivery',
    subtitle: 'Gmail OAuth 2.0',
    icon: Mail,
    colorClass: 'color-purple',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    subtitle: 'Workspace Themes',
    icon: Palette,
    colorClass: 'color-amber',
  },
  {
    id: 'backup',
    title: 'Backup & Data',
    subtitle: 'Export & Restore',
    icon: Download,
    colorClass: 'color-blue',
  },
];

export default function SettingsView({
  settings,
  busy,
  onSave,
  onClose,
  onExportBackup,
  onExportSqlite,
  onImportBackup,
  onExportCsv,
  initialTab = 'shop',
  onPresetsChanged,
  appVersion = '1.1.1',
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Shop & Tax configuration states
  const [taxRate, setTaxRate] = useState(settings.taxRate ?? '');
  const [nextOrderNum, setNextOrderNum] = useState(
    settings.nextOrderNumber ?? '1',
  );
  const [shopName, setShopName] = useState(
    settings.shopName ?? 'Katia Auto Sales & Repairs',
  );
  const [shopPhone, setShopPhone] = useState(
    settings.shopPhone ?? '(630) 907-7198',
  );
  const [shopAddress, setShopAddress] = useState(
    settings.shopAddress ?? '1005 Rural St, Aurora, IL 60505',
  );
  const [shopCity, setShopCity] = useState(settings.shopCity ?? 'Aurora');
  const [shopState, setShopState] = useState(settings.shopState ?? 'IL');
  const [shopZip, setShopZip] = useState(settings.shopZip ?? '60505');
  const [defaultTerms, setDefaultTerms] = useState(
    settings.defaultTerms ?? 'Balance due at vehicle pickup',
  );
  const [defaultWrittenBy, setDefaultWrittenBy] = useState(
    settings.defaultWrittenBy ?? '',
  );
  const [defaultTechnician, setDefaultTechnician] = useState(
    settings.defaultTechnician ?? '',
  );
  const [defaultCallWhenReady, setDefaultCallWhenReady] = useState(
    settings.defaultCallWhenReady ?? 'Yes',
  );
  const [defaultSaveOldParts, setDefaultSaveOldParts] = useState(
    settings.defaultSaveOldParts ?? 'Yes',
  );
  const [receiptStyle, setReceiptStyle] = useState<ReceiptStyle>(
    settings.receiptStyle ?? 'modern',
  );
  const [defaults, setDefaults] = useState<TaxDefaults>({
    ...settings.defaults,
  });
  const [currentTheme, setCurrentTheme] = useState(() => {
    return (
      document.documentElement.getAttribute('data-theme') ||
      localStorage.getItem('katia_theme') ||
      'classic'
    );
  });
  const [saved, setSaved] = useState(false);

  // Gmail OAuth 2.0 Integration state
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailAuthLoading, setGmailAuthLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [showOAuthCredentials, setShowOAuthCredentials] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [gmailTestEmail, setGmailTestEmail] = useState('');
  const [gmailTestLoading, setGmailTestLoading] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  const loadGmailStatus = () => {
    window.repairDesk
      .getGmailStatus()
      .then((status) => {
        setGmailStatus(status);
        if (status.clientId) setOauthClientId(status.clientId);
        if (!status.hasClientCredentials) setShowOAuthCredentials(true);
      })
      .catch((err) => console.error('Failed to get Gmail status:', err));
  };

  useEffect(() => {
    loadGmailStatus();
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleConnectGmail = async () => {
    setGmailAuthLoading(true);
    setGmailError('');
    try {
      const creds = oauthClientId.trim()
        ? {
            clientId: oauthClientId.trim(),
            clientSecret: oauthClientSecret.trim(),
          }
        : undefined;
      const res = await window.repairDesk.connectGmail(creds);
      if (res.success) {
        setGmailStatus({
          connected: true,
          email: res.email,
          hasClientCredentials: true,
          clientId: oauthClientId.trim() || gmailStatus?.clientId,
        });
        setGmailError('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGmailError(msg);
    } finally {
      setGmailAuthLoading(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setGmailAuthLoading(true);
    setGmailError('');
    try {
      await window.repairDesk.disconnectGmail();
      loadGmailStatus();
      setGmailTestResult({ status: 'idle', message: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGmailError(`Failed to disconnect: ${msg}`);
    } finally {
      setGmailAuthLoading(false);
    }
  };

  const handleSaveOAuthCredentials = async () => {
    if (!oauthClientId.trim()) {
      setGmailError('Please enter a Google Cloud OAuth Client ID.');
      return;
    }
    try {
      await window.repairDesk.saveGmailCredentials({
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim(),
      });
      setCredentialsSaved(true);
      setGmailError('');
      loadGmailStatus();
      setTimeout(() => setCredentialsSaved(false), 2200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGmailError(`Failed to save credentials: ${msg}`);
    }
  };

  const handleSendGmailTest = async () => {
    if (!gmailTestEmail.trim()) {
      setGmailTestResult({
        status: 'error',
        message: 'Please enter a recipient email address for the test.',
      });
      return;
    }
    setGmailTestLoading(true);
    setGmailTestResult({ status: 'idle', message: '' });
    try {
      const res = await window.repairDesk.sendGmailTestEmail(
        gmailTestEmail.trim(),
      );
      setGmailTestResult({
        status: 'success',
        message: `Test email sent successfully! Message ID: ${res.messageId} (from ${res.senderEmail})`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGmailTestResult({ status: 'error', message: msg });
    } finally {
      setGmailTestLoading(false);
    }
  };

  useEffect(() => {
    setTaxRate(settings.taxRate ?? '');
    setNextOrderNum(settings.nextOrderNumber ?? '1');
    setShopName(settings.shopName ?? 'Katia Auto Sales & Repairs');
    setShopPhone(settings.shopPhone ?? '(630) 907-7198');
    setShopAddress(settings.shopAddress ?? '1005 Rural St, Aurora, IL 60505');
    setShopCity(settings.shopCity ?? 'Aurora');
    setShopState(settings.shopState ?? 'IL');
    setShopZip(settings.shopZip ?? '60505');
    setDefaultTerms(settings.defaultTerms ?? 'Balance due at vehicle pickup');
    setDefaultWrittenBy(settings.defaultWrittenBy ?? '');
    setDefaultTechnician(settings.defaultTechnician ?? '');
    setDefaultCallWhenReady(settings.defaultCallWhenReady ?? 'Yes');
    setDefaultSaveOldParts(settings.defaultSaveOldParts ?? 'Yes');
    setReceiptStyle(settings.receiptStyle ?? 'modern');
    setDefaults({ ...settings.defaults });
  }, [settings]);

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    if (themeId === 'classic') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('katia_theme');
      void window.repairDesk?.setTitleBarOverlay?.({
        color: '#ffffff',
        symbolColor: '#0f172a',
      });
    } else {
      document.documentElement.setAttribute('data-theme', themeId);
      localStorage.setItem('katia_theme', themeId);
      if (themeId === 'abyssal') {
        void window.repairDesk?.setTitleBarOverlay?.({
          color: '#0f172a',
          symbolColor: '#f1f5f9',
        });
      } else {
        void window.repairDesk?.setTitleBarOverlay?.({
          color: '#ffffff',
          symbolColor: themeId === 'amber' ? '#1c1917' : '#0f172a',
        });
      }
    }
  };

  const handleSave = async () => {
    const updated: TaxSettings = {
      taxRate: taxRate.trim(),
      nextOrderNumber: nextOrderNum.trim(),
      shopName: shopName.trim(),
      shopPhone: shopPhone.trim(),
      shopAddress: shopAddress.trim(),
      shopCity: shopCity.trim(),
      shopState: shopState.trim(),
      shopZip: shopZip.trim(),
      defaultTerms: defaultTerms.trim(),
      defaultWrittenBy: defaultWrittenBy.trim(),
      defaultTechnician: defaultTechnician.trim(),
      defaultCallWhenReady,
      defaultSaveOldParts,
      receiptStyle,
      defaults,
    };
    await onSave(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      const nextIndex = (index + 1) % TABS.length;
      setActiveTab(TABS[nextIndex].id);
    } else if (e.key === 'ArrowLeft') {
      const prevIndex = (index - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prevIndex].id);
    }
  };

  return (
    <div className="settings-page animate-in">
      {/* Header Banner */}
      <div className="settings-header-banner">
        <div className="settings-banner-line" />
        <div className="settings-banner-content">
          <div>
            <div className="settings-system-pill">
              <div className="settings-system-pill-icon">
                <ShieldCheck size={15} />
              </div>
              <span>System Configuration · v{appVersion}</span>
            </div>
            <h2>App Settings</h2>
            <p className="settings-status-line">
              <span className="settings-live-dot" />
              Shop &amp; System Configuration · Local SQLite Storage · v
              {appVersion} (Auto-updating)
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="settings-back-button"
          >
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>

      {/* Compartmentalized Tabs Navigation */}
      <nav
        className="settings-tabs-nav"
        role="tablist"
        aria-label="Settings Categories"
      >
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-controls={`settings-tabpanel-${tab.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              onClick={() => setActiveTab(tab.id)}
              className={`settings-tab-btn ${isActive ? `active ${tab.colorClass}` : ''}`}
            >
              <div className="settings-tab-icon">
                <Icon size={18} />
              </div>
              <div className="settings-tab-titles">
                <span className="settings-tab-title">{tab.title}</span>
                <span className="settings-tab-subtitle">{tab.subtitle}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Tab Panels */}
      <div
        role="tabpanel"
        id={`settings-tabpanel-${activeTab}`}
        aria-labelledby={`settings-tab-${activeTab}`}
        className="settings-tab-panel animate-in"
      >
        {activeTab === 'shop' && (
          <ShopTab
            shopName={shopName}
            setShopName={setShopName}
            shopPhone={shopPhone}
            setShopPhone={setShopPhone}
            shopAddress={shopAddress}
            setShopAddress={setShopAddress}
            shopCity={shopCity}
            setShopCity={setShopCity}
            shopState={shopState}
            setShopState={setShopState}
            shopZip={shopZip}
            setShopZip={setShopZip}
            nextOrderNum={nextOrderNum}
            setNextOrderNum={setNextOrderNum}
            defaultTerms={defaultTerms}
            setDefaultTerms={setDefaultTerms}
            defaultWrittenBy={defaultWrittenBy}
            setDefaultWrittenBy={setDefaultWrittenBy}
            defaultTechnician={defaultTechnician}
            setDefaultTechnician={setDefaultTechnician}
            defaultCallWhenReady={defaultCallWhenReady}
            setDefaultCallWhenReady={setDefaultCallWhenReady}
            defaultSaveOldParts={defaultSaveOldParts}
            setDefaultSaveOldParts={setDefaultSaveOldParts}
            receiptStyle={receiptStyle}
            setReceiptStyle={setReceiptStyle}
            busy={busy}
            onSave={handleSave}
            saved={saved}
          />
        )}

        {activeTab === 'presets' && (
          <PresetsTab onPresetsChanged={onPresetsChanged} />
        )}

        {activeTab === 'taxes' && (
          <TaxesTab
            taxRate={taxRate}
            setTaxRate={setTaxRate}
            defaults={defaults}
            setDefaults={setDefaults}
            busy={busy}
            onSave={handleSave}
            saved={saved}
          />
        )}

        {activeTab === 'email' && (
          <GmailTab
            gmailStatus={gmailStatus}
            gmailAuthLoading={gmailAuthLoading}
            gmailError={gmailError}
            oauthClientId={oauthClientId}
            setOauthClientId={setOauthClientId}
            oauthClientSecret={oauthClientSecret}
            setOauthClientSecret={setOauthClientSecret}
            showOAuthCredentials={showOAuthCredentials}
            setShowOAuthCredentials={setShowOAuthCredentials}
            credentialsSaved={credentialsSaved}
            gmailTestEmail={gmailTestEmail}
            setGmailTestEmail={setGmailTestEmail}
            gmailTestLoading={gmailTestLoading}
            gmailTestResult={gmailTestResult}
            onConnectGmail={handleConnectGmail}
            onDisconnectGmail={handleDisconnectGmail}
            onSaveOAuthCredentials={handleSaveOAuthCredentials}
            onSendGmailTest={handleSendGmailTest}
          />
        )}

        {activeTab === 'appearance' && (
          <AppearanceTab
            currentTheme={currentTheme}
            onThemeChange={handleThemeChange}
          />
        )}

        {activeTab === 'backup' && (
          <BackupsTab
            busy={busy}
            onExportBackup={onExportBackup}
            onExportSqlite={onExportSqlite}
            onImportBackup={onImportBackup}
            onExportCsv={onExportCsv}
          />
        )}
      </div>
    </div>
  );
}
