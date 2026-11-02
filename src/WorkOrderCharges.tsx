import { useMemo } from 'react';
import { Wrench, Package, Plus, Trash2 } from 'lucide-react';
import {
  defaultTaxable,
  lineTotal,
  type ChargeKind,
  type ChargeLine,
  type TaxDefaults,
} from './workOrder';

interface WorkOrderChargesProps {
  charges: ChargeLine[];
  defaults: TaxDefaults;
  onChange: (charges: ChargeLine[]) => void;
}

export default function WorkOrderCharges({
  charges,
  defaults,
  onChange,
}: WorkOrderChargesProps) {
  // Separate charges into Labor/Services vs Replacement Parts
  const laborLines = useMemo(
    () => charges.filter((c) => c.kind !== 'parts'),
    [charges],
  );

  const partLines = useMemo(
    () => charges.filter((c) => c.kind === 'parts'),
    [charges],
  );

  // Subtotals
  const laborSubtotal = useMemo(
    () => laborLines.reduce((sum, line) => sum + lineTotal(line), 0),
    [laborLines],
  );

  const partsSubtotal = useMemo(
    () => partLines.reduce((sum, line) => sum + lineTotal(line), 0),
    [partLines],
  );

  // --- Labor Operations Handlers ---
  const updateLabor = (index: number, patch: Partial<ChargeLine>) => {
    const next = laborLines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    onChange([...next, ...partLines]);
  };

  const changeLaborKind = (index: number, kind: ChargeKind) => {
    const line = laborLines[index];
    const overridden =
      line.taxable !== undefined &&
      line.taxable !== defaultTaxable(line.kind, defaults);
    updateLabor(index, {
      kind,
      taxable: overridden ? line.taxable : defaultTaxable(kind, defaults),
    });
  };

  const addLabor = () => {
    const newLine: ChargeLine = {
      kind: 'labor',
      description: '',
      amount: '',
      quantity: '1',
      unitPrice: '',
      taxable: defaultTaxable('labor', defaults),
    };
    onChange([...laborLines, newLine, ...partLines]);
  };

  const removeLabor = (index: number) => {
    const next = laborLines.filter((_, i) => i !== index);
    onChange([...next, ...partLines]);
  };

  // --- Replacement Parts Handlers ---
  const updatePart = (index: number, patch: Partial<ChargeLine>) => {
    const next = partLines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    onChange([...laborLines, ...next]);
  };

  const addPart = () => {
    const newLine: ChargeLine = {
      kind: 'parts',
      partNumber: '',
      description: '',
      amount: '',
      quantity: '1',
      unitPrice: '',
      taxable: defaultTaxable('parts', defaults),
    };
    onChange([...laborLines, ...partLines, newLine]);
  };

  const removePart = (index: number) => {
    const next = partLines.filter((_, i) => i !== index);
    onChange([...laborLines, ...next]);
  };

  return (
    <div className="work-order-charges-container full-width">
      {/* 1. Labor & Work Performed Section */}
      <section
        className="charges-section labor-section"
        aria-label="Labor and work performed"
      >
        <div className="section-bar">
          <div className="section-title-wrap">
            <div className="section-badge labor-badge">
              <Wrench size={14} />
            </div>
            <div>
              <h3>Labor / Work Performed</h3>
              <span className="section-subtitle">
                Services, body repairs, paint refinishing &amp; labor operations
              </span>
            </div>
          </div>
          <div className="section-actions">
            <span className="section-subtotal">
              Labor subtotal: <strong>${laborSubtotal.toFixed(2)}</strong>
            </span>
            <button
              type="button"
              className="section-add-btn primary-add"
              onClick={addLabor}
            >
              <Plus size={14} /> Add labor / service
            </button>
          </div>
        </div>

        {laborLines.length > 0 && (
          <div className="charge-column-labels labor-columns">
            <span className="col-type">Type</span>
            <span className="col-qty">Hours/Qty</span>
            <span className="col-desc">Work / Service Description</span>
            <span className="col-price">Rate/Price</span>
            <span className="col-total">Amount</span>
            <span className="col-tax">Tax</span>
            <span className="col-del" />
          </div>
        )}

        <div className="charges-list">
          {laborLines.length === 0 ? (
            <div className="charges-empty-card">
              <div className="empty-card-text">
                <Wrench size={16} className="empty-icon" />
                <span>
                  No labor operations added yet. Click &ldquo;Add labor /
                  service&rdquo; to add body work, refinishing, or mechanical
                  labor.
                </span>
              </div>
              <button
                type="button"
                className="empty-card-action"
                onClick={addLabor}
              >
                ＋ Add labor
              </button>
            </div>
          ) : (
            laborLines.map((line, index) => (
              <div className="charge-row labor-row" key={index}>
                <select
                  className="row-kind-select"
                  aria-label="Charge category"
                  value={line.kind}
                  onChange={(e) =>
                    changeLaborKind(index, e.target.value as ChargeKind)
                  }
                >
                  <option value="labor">Labor</option>
                  <option value="sublet">Sublet</option>
                  <option value="fluids">Gas, oil &amp; fluids</option>
                  <option value="disposal">EPA / disposal</option>
                  <option value="other">Other</option>
                </select>

                <input
                  className="row-qty-input"
                  aria-label="Labor hours or quantity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={line.quantity ?? '1'}
                  onChange={(e) =>
                    updateLabor(index, { quantity: e.target.value })
                  }
                  placeholder="Hrs"
                />

                <input
                  className="row-desc-input"
                  aria-label="Work description"
                  value={line.description}
                  onChange={(e) =>
                    updateLabor(index, { description: e.target.value })
                  }
                  placeholder="Describe repair operation (e.g. R&amp;I bumper, blend fender)…"
                />

                <input
                  className="row-price-input"
                  aria-label="Hourly rate or price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice ?? ''}
                  onChange={(e) =>
                    updateLabor(index, { unitPrice: e.target.value })
                  }
                  placeholder="Rate ($)"
                />

                <output
                  className="row-total-output"
                  aria-label="Labor total"
                  title="Hours × rate"
                >
                  ${lineTotal(line).toFixed(2)}
                </output>

                <label
                  className="row-tax-label"
                  title="Include labor in sales tax"
                >
                  <input
                    type="checkbox"
                    checked={
                      line.taxable ?? defaultTaxable(line.kind, defaults)
                    }
                    onChange={(e) =>
                      updateLabor(index, { taxable: e.target.checked })
                    }
                  />
                  <span>Tax</span>
                </label>

                <button
                  type="button"
                  className="row-remove-btn"
                  aria-label="Remove labor line"
                  onClick={() => removeLabor(index)}
                  title="Remove this line"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 2. Replacement Parts Section */}
      <section
        className="charges-section parts-section"
        aria-label="Replacement parts"
      >
        <div className="section-bar">
          <div className="section-title-wrap">
            <div className="section-badge parts-badge">
              <Package size={14} />
            </div>
            <div>
              <h3>Parts Replaced</h3>
              <span className="section-subtitle">
                OEM, aftermarket, or replacement components installed on vehicle
              </span>
            </div>
          </div>
          <div className="section-actions">
            <span className="section-subtotal">
              Parts subtotal: <strong>${partsSubtotal.toFixed(2)}</strong>
            </span>
            <button
              type="button"
              className="section-add-btn parts-add"
              onClick={addPart}
            >
              <Plus size={14} /> Add replacement part
            </button>
          </div>
        </div>

        {partLines.length > 0 && (
          <div className="charge-column-labels parts-columns">
            <span className="col-qty">Qty</span>
            <span className="col-partno">Part Number</span>
            <span className="col-desc">Part Description</span>
            <span className="col-price">Unit Price</span>
            <span className="col-total">Amount</span>
            <span className="col-tax">Tax</span>
            <span className="col-del" />
          </div>
        )}

        <div className="charges-list">
          {partLines.length === 0 ? (
            <div className="charges-empty-card labor-only-notice">
              <div className="empty-card-text">
                <Package size={16} className="empty-icon" />
                <span>
                  <strong>No parts required</strong> — This is currently a
                  labor-only repair. If replacement parts are needed, click
                  &ldquo;Add replacement part&rdquo;.
                </span>
              </div>
              <button
                type="button"
                className="empty-card-action"
                onClick={addPart}
              >
                ＋ Add a part
              </button>
            </div>
          ) : (
            partLines.map((line, index) => (
              <div className="charge-row parts-row" key={index}>
                <input
                  className="row-qty-input"
                  aria-label="Part quantity"
                  type="number"
                  min="0"
                  step="1"
                  value={line.quantity ?? '1'}
                  onChange={(e) =>
                    updatePart(index, { quantity: e.target.value })
                  }
                  placeholder="Qty"
                />

                <input
                  className="row-partno-input"
                  aria-label="Part number"
                  value={line.partNumber ?? ''}
                  onChange={(e) =>
                    updatePart(index, { partNumber: e.target.value })
                  }
                  placeholder="Part no. (OEM / #)"
                />

                <input
                  className="row-desc-input"
                  aria-label="Part description"
                  value={line.description}
                  onChange={(e) =>
                    updatePart(index, { description: e.target.value })
                  }
                  placeholder="Describe replacement part (e.g. Front bumper cover)…"
                />

                <input
                  className="row-price-input"
                  aria-label="Unit price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice ?? ''}
                  onChange={(e) =>
                    updatePart(index, { unitPrice: e.target.value })
                  }
                  placeholder="Unit price ($)"
                />

                <output
                  className="row-total-output"
                  aria-label="Part total"
                  title="Quantity × unit price"
                >
                  ${lineTotal(line).toFixed(2)}
                </output>

                <label
                  className="row-tax-label"
                  title="Include part in sales tax"
                >
                  <input
                    type="checkbox"
                    checked={line.taxable ?? defaultTaxable('parts', defaults)}
                    onChange={(e) =>
                      updatePart(index, { taxable: e.target.checked })
                    }
                  />
                  <span>Tax</span>
                </label>

                <button
                  type="button"
                  className="row-remove-btn"
                  aria-label="Remove part"
                  onClick={() => removePart(index)}
                  title="Remove this part"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
