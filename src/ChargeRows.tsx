import {
  defaultTaxable,
  lineTotal,
  type ChargeKind,
  type ChargeLine,
  type TaxDefaults,
} from './workOrder';

type Props = {
  charges: ChargeLine[];
  defaults: TaxDefaults;
  onChange: (charges: ChargeLine[]) => void;
  heading: string;
  minLines?: number;
  emptyHint?: string;
};

function ChargeRows({
  charges,
  defaults,
  onChange,
  heading,
  minLines = 1,
  emptyHint,
}: Props) {
  const patch = (index: number, changes: Partial<ChargeLine>) =>
    onChange(
      charges.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line,
      ),
    );
  const update = (
    index: number,
    key: 'description' | 'quantity' | 'unitPrice' | 'partNumber',
    value: string,
  ) => patch(index, { [key]: value });
  const changeKind = (index: number, kind: ChargeKind) => {
    const line = charges[index];
    const overridden =
      line.taxable !== undefined &&
      line.taxable !== defaultTaxable(line.kind, defaults);
    patch(index, {
      kind,
      taxable: overridden ? line.taxable : defaultTaxable(kind, defaults),
    });
  };
  const add = () =>
    onChange([
      ...charges,
      {
        kind: 'labor',
        description: '',
        amount: '',
        quantity: '1',
        unitPrice: '',
        taxable: defaultTaxable('labor', defaults),
      },
    ]);

  return (
    <div
      className="field full-width charges-field"
      role="group"
      aria-label={heading}
    >
      <div className="charge-heading">
        <span>{heading}</span>
        <button type="button" onClick={add}>
          ＋ Add line
        </button>
      </div>
      {charges.map((charge, index) => (
        <div className="charge-row" key={index}>
          <select
            aria-label="Charge type"
            value={charge.kind}
            onChange={(event) =>
              changeKind(index, event.target.value as ChargeKind)
            }
          >
            <option value="parts">Parts</option>
            <option value="labor">Labor</option>
            <option value="sublet">Sublet</option>
            <option value="fluids">Gas, oil & grease</option>
            <option value="disposal">EPA / waste disposal</option>
            <option value="other">Other</option>
          </select>
          <input
            aria-label="Quantity"
            type="number"
            min="0"
            step="0.01"
            value={charge.quantity ?? '1'}
            onChange={(event) => update(index, 'quantity', event.target.value)}
            placeholder="Qty"
          />
          <input
            aria-label="Part number"
            value={charge.partNumber ?? ''}
            onChange={(event) =>
              update(index, 'partNumber', event.target.value)
            }
            placeholder="Part no."
          />
          <input
            aria-label="Line description"
            value={charge.description}
            onChange={(event) =>
              update(index, 'description', event.target.value)
            }
            placeholder="Describe the part or work"
          />
          <input
            aria-label="Unit price"
            type="number"
            min="0"
            step="0.01"
            value={charge.unitPrice ?? ''}
            onChange={(event) => update(index, 'unitPrice', event.target.value)}
            placeholder="Unit price"
          />
          <output
            className="charge-total"
            aria-label="Line total"
            title="Quantity × unit price"
          >
            ${lineTotal(charge).toFixed(2)}
          </output>
          <label className="charge-tax" title="Include this line in sales tax">
            <input
              type="checkbox"
              checked={charge.taxable ?? defaultTaxable(charge.kind, defaults)}
              onChange={(event) =>
                patch(index, { taxable: event.target.checked })
              }
            />
            <span>Tax</span>
          </label>
          <button
            type="button"
            className="remove-charge"
            aria-label="Remove line"
            disabled={charges.length <= minLines}
            onClick={() =>
              onChange(charges.filter((_, lineIndex) => lineIndex !== index))
            }
          >
            ×
          </button>
        </div>
      ))}
      {!charges.length && emptyHint && (
        <p className="charge-empty">{emptyHint}</p>
      )}
    </div>
  );
}

export default ChargeRows;
