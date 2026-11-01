import { Percent, Check, RotateCcw } from 'lucide-react';
import { builtInTaxDefaults, type ChargeKind } from '../workOrder';
import type { TaxesTabProps } from './types';

const KINDS: Array<{ kind: ChargeKind; label: string; hint: string }> = [
  { kind: 'parts', label: 'Parts', hint: 'Installed parts and materials' },
  { kind: 'labor', label: 'Labor', hint: 'Repair labor and shop services' },
  { kind: 'sublet', label: 'Sublet', hint: 'Work sent to another shop' },
  {
    kind: 'fluids',
    label: 'Gas, oil & grease',
    hint: 'Fluids added during the repair',
  },
  {
    kind: 'disposal',
    label: 'EPA / waste disposal',
    hint: 'Hazardous waste and disposal fees',
  },
  {
    kind: 'other',
    label: 'Other',
    hint: 'Shop supplies and miscellaneous charges',
  },
];

export default function TaxesTab({
  taxRate,
  setTaxRate,
  defaults,
  setDefaults,
  busy,
  onSave,
  saved,
}: TaxesTabProps) {
  return (
    <div className="settings-single-col">
      <div className="settings-card-panel">
        <div className="settings-card-top">
          <div className="settings-card-icon-box teal">
            <Percent size={26} />
          </div>
          <div>
            <h3>Sales Tax &amp; Charge Rules</h3>
            <p>
              Configure default sales tax rate and preset taxable status for
              each charge type
            </p>
          </div>
        </div>

        {/* Section 1: Default Sales Tax Rate */}
        <div className="settings-tax-rate-card">
          <div className="settings-tax-rate-info">
            <strong>Default Sales Tax Rate (%)</strong>
            <small>
              Automatically prefilled when drafting new repair orders and
              receipts. Line items can still be exempted individually.
            </small>
          </div>
          <div className="settings-tax-rate-input-wrap">
            <div className="settings-input-wrap">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="8.25"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
              <div className="settings-input-icon">
                <Percent size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Default Charge Taxability */}
        <div className="settings-section-divider">
          <span>Default Charge Rules (New Orders)</span>
        </div>

        <p className="settings-field-hint" style={{ marginBottom: 16 }}>
          Choose which charge categories start checked as taxable when added to
          a new repair order.
        </p>

        <div className="settings-tax-rows">
          {KINDS.map(({ kind, label, hint }) => (
            <label className="settings-tax-row" key={kind}>
              <div>
                <strong>{label}</strong>
                <small>{hint}</small>
              </div>
              <input
                type="checkbox"
                checked={defaults[kind]}
                onChange={(e) =>
                  setDefaults((curr) => ({
                    ...curr,
                    [kind]: e.target.checked,
                  }))
                }
              />
              <span
                className={`settings-state ${defaults[kind] ? 'taxable' : ''}`}
              >
                {defaults[kind] ? 'Taxable' : 'Tax exempt'}
              </span>
            </label>
          ))}
        </div>

        <div className="settings-actions-bar" style={{ marginBottom: 24 }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setDefaults({ ...builtInTaxDefaults })}
            title="Reset default taxable flags to system defaults"
          >
            <RotateCcw size={14} />
            <span>Reset to built-in rules</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy}
          className={`settings-save-button ${saved ? 'saved' : ''}`}
        >
          {saved ? (
            <>
              <Check size={18} />
              <span>Tax Settings Saved!</span>
            </>
          ) : (
            <>
              <Percent size={18} />
              <span>{busy ? 'Saving…' : 'Save Tax Settings'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
