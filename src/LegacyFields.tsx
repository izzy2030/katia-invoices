import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import {
  defaultLegacy,
  otherChargesTotal,
  type ChargeTotals,
  type LegacyDetails,
} from './workOrder';

type Props = {
  value: LegacyDetails;
  totals: ChargeTotals;
  revisedTotals: ChargeTotals;
  revisedEditor: ReactNode;
  onChange: (key: keyof LegacyDetails, value: string) => void;
};
type SignatureProps = Pick<Props, 'value' | 'onChange'>;

function Signature({ value, onChange }: SignatureProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const painted = useRef('');

  useEffect(() => {
    const element = canvas.current;
    if (!element || value.signature === painted.current) return;
    const context = element.getContext('2d')!;
    context.clearRect(0, 0, element.width, element.height);
    if (!value.signature) {
      painted.current = '';
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled || drawing.current) return;
      context.clearRect(0, 0, element.width, element.height);
      context.drawImage(image, 0, 0, element.width, element.height);
      painted.current = value.signature;
    };
    image.src = value.signature;
    return () => {
      cancelled = true;
    };
  }, [value.signature]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * event.currentTarget.width) / rect.width,
      ((event.clientY - rect.top) * event.currentTarget.height) / rect.height,
    ];
  }
  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const context = canvas.current!.getContext('2d')!;
    const [x, y] = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#17243b';
    context.stroke();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const [x, y] = point(event);
    const context = canvas.current!.getContext('2d')!;
    context.lineTo(x, y);
    context.stroke();
  }
  function finish() {
    if (!drawing.current) return;
    drawing.current = false;
    const signature = canvas.current!.toDataURL('image/png');
    painted.current = signature;
    onChange('signature', signature);
  }
  function clear() {
    const element = canvas.current;
    if (!element) return;
    element.getContext('2d')!.clearRect(0, 0, element.width, element.height);
    painted.current = '';
    onChange('signature', '');
  }
  return (
    <div className="signature-entry full-width">
      <label>Customer signature — draw with mouse, pen, or touch</label>
      <canvas
        ref={canvas}
        width={700}
        height={120}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Draw customer signature"
      />
      <button
        type="button"
        className="secondary-button"
        onClick={clear}
        disabled={!value.signature}
      >
        Clear signature
      </button>
    </div>
  );
}

export default function LegacyFields({
  value,
  totals,
  revisedTotals,
  revisedEditor,
  onChange,
}: Props) {
  const field = (key: keyof LegacyDetails, label: string, type = 'text') => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? '0' : undefined}
        value={value[key]}
        onChange={(event) => onChange(key, event.target.value)}
      />
    </label>
  );
  const select = (
    key: keyof LegacyDetails,
    label: string,
    options: string[],
  ) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <select
        value={value[key]}
        onChange={(event) => onChange(key, event.target.value)}
      >
        <option value="">Not specified</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
  const calculated = (label: string, amount: number) => (
    <div className="field readonly" key={label}>
      <span>{label}</span>
      <strong>${amount.toFixed(2)}</strong>
    </div>
  );
  const approval = (prefix: 'estimate' | 'revised') => {
    const key = (suffix: string) => (prefix + suffix) as keyof LegacyDetails;
    if (prefix === 'estimate')
      return (
        <>
          <div className="form-grid legacy-grid">
            {calculated('Parts (from line items)', totals.parts)}
            {calculated('Labor (from line items)', totals.labor)}
            {calculated('Other charges', otherChargesTotal(totals))}
            {calculated('Tax', totals.tax)}
            <div className="estimate-total">
              Estimated total <strong>${totals.total.toFixed(2)}</strong>
            </div>
            {field(key('AuthorizedBy'), 'Authorized by')}
            {select(key('Method'), 'Authorization method', [
              'In person',
              'By phone',
            ])}
            {field(key('Date'), 'Authorization date', 'date')}
            {field(key('Time'), 'Authorization time', 'time')}
            {field(key('CalledBy'), 'Called by')}
            {field(key('Phone'), 'Authorization phone', 'tel')}
          </div>
          <p className="policy-help">
            The estimate comes from the repair line items above. Change the
            lines to change these amounts.
          </p>
        </>
      );
    const revisedEstimate =
      Math.round((totals.total + revisedTotals.total) * 100) / 100;
    return (
      <>
        <div className="form-grid legacy-grid">
          {calculated('Additional parts', revisedTotals.parts)}
          {calculated('Additional labor', revisedTotals.labor)}
          {calculated('Other charges', otherChargesTotal(revisedTotals))}
          {calculated('Tax', revisedTotals.tax)}
          {calculated('Additional total', revisedTotals.total)}
          {calculated('Original estimate', totals.total)}
          <div className="estimate-total">
            Revised estimate <strong>${revisedEstimate.toFixed(2)}</strong>
          </div>
          {field(key('AuthorizedBy'), 'Authorized by')}
          {select(key('Method'), 'Authorization method', [
            'In person',
            'By phone',
          ])}
          {field(key('Date'), 'Authorization date', 'date')}
          {field(key('Time'), 'Authorization time', 'time')}
          {field(key('CalledBy'), 'Called by')}
          {field(key('Phone'), 'Authorization phone', 'tel')}
        </div>
        <p className="policy-help">
          Additional lines use the same tax rate and per-line Tax setting as the
          estimate.
        </p>
      </>
    );
  };
  return (
    <>
      <details className="form-card legacy-details" open>
        <summary>Contact and shop details</summary>
        <div className="form-grid legacy-grid">
          {field('phoneExtension', 'Business phone extension')}
          {field('homePhone', 'Home phone', 'tel')}
          {field('customerOrderNumber', 'Customer order number')}
          {field('writtenBy', 'Written by')}
          {field('technician', 'Mechanic / technician')}
          {select('callWhenReady', 'Call when ready', ['Yes', 'No'])}
          {field('terms', 'Terms')}
          {select('saveOldParts', 'Save old parts', ['Yes', 'No'])}
          {field('depositAmount', 'Special-order deposit', 'number')}
        </div>
      </details>
      <details className="form-card legacy-details">
        <summary>Estimated costs and authorization</summary>
        {approval('estimate')}
      </details>
      <details className="form-card legacy-details">
        <summary>Revised estimate / additional work</summary>
        <label className="field">
          <span>Additional work description</span>
          <textarea
            rows={3}
            value={value.revisedDescription}
            onChange={(event) =>
              onChange('revisedDescription', event.target.value)
            }
          />
        </label>
        {revisedEditor}
        {approval('revised')}
      </details>
      <details className="form-card legacy-details">
        <summary>Customer signature and notices</summary>
        <div className="form-grid legacy-grid">
          <Signature value={value} onChange={onChange} />
          {field('signatureDate', 'Signature date', 'date')}
          {(
            ['noticeEnglish', 'noticeSpanish', 'authorizationText'] as const
          ).map((key) => (
            <label className="field full-width" key={key}>
              <span>
                {key === 'noticeEnglish'
                  ? 'English shop notice'
                  : key === 'noticeSpanish'
                    ? 'Spanish shop notice'
                    : 'Repair authorization wording'}
              </span>
              <textarea
                rows={4}
                value={value[key]}
                onChange={(event) => onChange(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="policy-help">
          The deposit amount replaces {'{deposit}'} in the printed notices.
          These notices start with the wording from the supplied form.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            onChange('noticeEnglish', defaultLegacy.noticeEnglish);
            onChange('noticeSpanish', defaultLegacy.noticeSpanish);
            onChange('authorizationText', defaultLegacy.authorizationText);
          }}
        >
          Restore form wording
        </button>
      </details>
    </>
  );
}
