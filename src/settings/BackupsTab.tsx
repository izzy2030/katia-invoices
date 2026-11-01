import { useEffect, useState } from 'react';
import {
  Download,
  Upload,
  FileSpreadsheet,
  Database,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type { BackupImportMode } from '../backupService';
import type { BackupTabProps } from './types';

export default function BackupsTab({
  busy,
  onExportBackup,
  onExportSqlite,
  onImportBackup,
  onExportCsv,
}: BackupTabProps) {
  const [importMode, setImportMode] = useState<BackupImportMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [dbInfo, setDbInfo] = useState<{
    dbPath: string;
    dbFileName: string;
    dbFolder: string;
  } | null>(null);

  useEffect(() => {
    if (window.repairDesk?.getDatabaseInfo) {
      window.repairDesk
        .getDatabaseInfo()
        .then(setDbInfo)
        .catch(() => {});
    }
  }, []);

  const handleModeChange = (mode: BackupImportMode) => {
    setImportMode(mode);
    setConfirmReplace(false);
    setStatusFeedback(null);
  };

  const handleImportClick = async () => {
    if (!onImportBackup) return;
    if (importMode === 'replace' && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    setStatusFeedback(null);
    try {
      const result = await onImportBackup(importMode);
      if (result && !result.canceled) {
        const formatLabel =
          result.sourceFormat === 'sqlite' ? 'SQLite database' : 'JSON backup';
        const modeLabel =
          result.mode === 'replace' ? 'Replaced all data' : 'Merged records';
        const fileLabel = result.fileName ? ` from ${result.fileName}` : '';
        setStatusFeedback({
          type: 'success',
          message: `${modeLabel} using ${formatLabel}${fileLabel}: ${result.ordersAdded} added, ${result.ordersUpdated} updated (${result.totalOrders} total repair orders, ${result.totalContacts} customer contacts).`,
        });
      }
    } catch (err: unknown) {
      const rawMsg =
        err instanceof Error ? err.message : 'Could not restore backup file.';
      const msg = rawMsg.replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/i,
        '',
      );
      setStatusFeedback({
        type: 'error',
        message: msg || 'Could not restore backup file.',
      });
    }
  };

  return (
    <div className="settings-single-col">
      <div className="settings-card-panel">
        <div className="settings-card-top">
          <div className="settings-card-icon-box blue">
            <Download size={26} />
          </div>
          <div>
            <h3>Data Management &amp; Local Backups</h3>
            <p>
              Export, restore, or migrate your repair orders, customer profiles,
              and shop database across PCs
            </p>
          </div>
        </div>

        {statusFeedback && (
          <div
            className={`settings-test-feedback ${statusFeedback.type === 'success' ? 'success' : 'error'} settings-backup-feedback`}
            role="status"
          >
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span>{statusFeedback.message}</span>
          </div>
        )}

        <div className="settings-export-grid">
          {onExportBackup && (
            <div className="settings-export-box">
              <div>
                <strong>Export Database Backup (.json)</strong>
                <small>
                  Save a portable snapshot of all repair orders, customer
                  profiles, vehicle histories, and shop configuration to a JSON
                  backup file.
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={onExportBackup}
              >
                <Download size={15} />
                <span>Save Backup (.json)</span>
              </button>
            </div>
          )}

          {onImportBackup && (
            <div className="settings-export-box settings-import-box">
              <div>
                <strong>Restore / Import Backup (.json or .sqlite)</strong>
                <small>
                  Move or merge data from another PC using a saved{' '}
                  <code>.json</code> backup or <code>.sqlite</code> database
                  file.
                </small>

                <div
                  className="backup-mode-selector"
                  role="radiogroup"
                  aria-label="Backup import mode"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={importMode === 'merge'}
                    className={`backup-mode-pill ${importMode === 'merge' ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => handleModeChange('merge')}
                  >
                    <RefreshCw size={13} />
                    <span>Merge with Existing</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={importMode === 'replace'}
                    className={`backup-mode-pill ${importMode === 'replace' ? 'active replace' : ''}`}
                    disabled={busy}
                    onClick={() => handleModeChange('replace')}
                  >
                    <AlertTriangle size={13} />
                    <span>Replace All Data</span>
                  </button>
                </div>

                {importMode === 'replace' && (
                  <p className="backup-replace-warning">
                    Replace mode overwrites all local repair orders and customer
                    contacts on this PC with the selected backup file.
                  </p>
                )}
              </div>

              <div className="backup-import-actions">
                <button
                  type="button"
                  className={
                    confirmReplace
                      ? 'primary-button danger-confirm-btn'
                      : 'primary-button'
                  }
                  disabled={busy}
                  onClick={() => void handleImportClick()}
                >
                  <Upload size={15} />
                  <span>
                    {confirmReplace
                      ? 'Confirm Replace & Choose File...'
                      : importMode === 'replace'
                        ? 'Replace from Backup...'
                        : 'Import & Merge Backup...'}
                  </span>
                </button>
                {confirmReplace && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setConfirmReplace(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {onExportSqlite && (
            <div className="settings-export-box">
              <div>
                <strong>Export SQLite Database (.sqlite)</strong>
                <small>
                  Save a standalone, single-file copy of the live SQLite
                  database for direct archival or restoring onto a second
                  workstation.
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={onExportSqlite}
              >
                <Database size={15} />
                <span>Save SQLite (.sqlite)</span>
              </button>
            </div>
          )}

          {onExportCsv && (
            <div className="settings-export-box">
              <div>
                <strong>Export Orders Spreadsheet (.csv)</strong>
                <small>
                  Export all repair orders and financials to a clean CSV
                  spreadsheet for Microsoft Excel, Apple Numbers, or your
                  accountant.
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={onExportCsv}
              >
                <FileSpreadsheet size={15} />
                <span>Export to CSV (.csv)</span>
              </button>
            </div>
          )}
        </div>

        <div className="settings-sqlite-info-box">
          <div className="settings-sqlite-icon-box">
            <Database size={22} />
          </div>
          <div className="settings-sqlite-content">
            <strong>Local SQLite Database Storage</strong>
            <p>
              All repair orders, vehicle histories, customer contact profiles,
              and application settings are saved locally on this machine using
              embedded SQLite (
              <code>{dbInfo?.dbFileName || 'katia-body-shop.sqlite'}</code>).
              Katia Body Shop does not depend on any remote cloud database, so
              your data stays entirely in your control.
            </p>
            {dbInfo?.dbPath && (
              <div className="settings-sqlite-path-row">
                <code className="settings-sqlite-path" title={dbInfo.dbPath}>
                  {dbInfo.dbPath}
                </code>
                <button
                  type="button"
                  className="secondary-button settings-open-folder-btn"
                  onClick={() =>
                    void window.repairDesk.openPath(dbInfo.dbFolder)
                  }
                >
                  <FolderOpen size={14} />
                  <span>Open Database Folder</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
