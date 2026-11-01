import { Download, FileSpreadsheet, Database } from 'lucide-react';
import type { BackupTabProps } from './types';

export default function BackupsTab({
  busy,
  onExportBackup,
  onExportCsv,
}: BackupTabProps) {
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
              Export local snapshots of your database and spreadsheets for
              accounting or safekeeping
            </p>
          </div>
        </div>

        <div className="settings-export-grid">
          {onExportBackup && (
            <div className="settings-export-box">
              <div>
                <strong>Export Database Backup</strong>
                <small>
                  Save a full snapshot of all repair orders, customer profiles,
                  vehicle histories, and shop configuration to a JSON backup
                  file.
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

          {onExportCsv && (
            <div className="settings-export-box">
              <div>
                <strong>Export Orders Spreadsheet</strong>
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

        <div className="settings-sqlite-info-box" style={{ marginTop: 24 }}>
          <div className="settings-sqlite-icon-box">
            <Database size={22} />
          </div>
          <div className="settings-sqlite-content">
            <strong>Local SQLite Database Storage</strong>
            <p>
              All repair orders, vehicle histories, customer contact profiles,
              and application settings are saved locally on this machine using
              embedded SQLite (<code>katia-body-shop.db</code>). Katia Body Shop
              does not depend on any remote cloud database, so your data stays
              entirely in your control.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
