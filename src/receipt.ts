import { katiaHexBadgeSvg } from './logo';
import { classicReceiptHtml } from './receiptClassic';
import { MANROPE_WOFF2_BASE64 } from './receiptFont';
import {
  chargeTotals,
  defaultLegacy,
  defaultTaxable,
  hasSupplementLines,
  lineTotal,
  moneyValue,
  normalizeInput,
  otherChargesTotal,
  supplementTotals,
  type ChargeLine,
  type WorkOrder,
  type TaxSettings,
} from './workOrder';

export function receiptHtml(
  raw: WorkOrder,
  settings?: TaxSettings,
  options?: { isBlank?: boolean },
) {
  const isBlank = Boolean(options?.isBlank);
  return settings?.receiptStyle === 'classic'
    ? classicReceiptHtml(raw, settings, { isBlank })
    : modernReceiptHtml(raw, settings, { isBlank });
}

function modernReceiptHtml(
  raw: WorkOrder,
  settings?: TaxSettings,
  options?: { isBlank?: boolean },
) {
  const isBlank = Boolean(options?.isBlank);
  const order = { ...raw, ...normalizeInput(raw) };
  const details = { ...defaultLegacy, ...order.legacy };
  const e = (value: unknown) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]!,
    );
  const money = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const date = (value: string | undefined) => {
    const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value?.trim() ?? '';
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };
  const fact = (label: string, value: unknown, className = '') =>
    String(value ?? '').trim()
      ? `<div class="fact ${className}"><label>${e(label)}</label><div>${e(value)}</div></div>`
      : '';

  const totals = chargeTotals(order);
  const taxLabel = order.taxRate?.trim()
    ? `Tax (${order.taxRate.trim()}%)`
    : 'Tax';

  const hasContent = (line: ChargeLine) => line.description || line.amount;
  const lineRow = (line: ChargeLine) => {
    const taxable = line.taxable ?? defaultTaxable(line.kind);
    const showKind = line.kind !== 'parts' && line.kind !== 'labor';
    return `<tr class="line">
      <td class="qty">${e(line.quantity || '1')}</td>
      <td class="item">${e(line.description)}${line.partNumber ? `<small class="mono">${e(line.partNumber)}</small>` : ''}${showKind ? `<span class="kind">${e(line.kind)}</span>` : ''}</td>
      <td class="num">${line.unitPrice ? money(Number(line.unitPrice)) : ''}</td>
      <td class="tax">${taxable ? 'Tax' : ''}</td>
      <td class="num amount">${money(lineTotal(line))}</td>
    </tr>`;
  };
  const lineGroup = (
    title: string,
    note: string,
    lines: ChargeLine[],
    total: number,
    detail = '',
  ) =>
    lines.length
      ? `<tbody>
          <tr class="group"><td colspan="4">${e(title)}${note ? `<small>${e(note)}</small>` : ''}</td><td class="num">${money(total)}</td></tr>
          ${detail ? `<tr class="group-detail"><td></td><td colspan="4">${e(detail)}</td></tr>` : ''}
          ${lines.map(lineRow).join('')}
        </tbody>`
      : '';

  const partLines = order.charges.filter(
    (line) => line.kind === 'parts' && hasContent(line),
  );
  const laborLines = order.charges.filter(
    (line) => line.kind !== 'parts' && hasContent(line),
  );
  const supplementLines = (order.revisedCharges ?? []).filter(hasContent);

  const supplement = supplementTotals(order);
  const hasSupplement = hasSupplementLines(order);
  const hasRevised =
    hasSupplement ||
    Boolean(
      details.revisedParts ||
      details.revisedLabor ||
      details.revisedDescription ||
      details.revisedAuthorizedBy,
    );
  const addlParts = hasSupplement
    ? supplement.parts
    : moneyValue(details.revisedParts);
  const addlLabor = hasSupplement
    ? supplement.labor
    : moneyValue(details.revisedLabor);
  const addlTotal = hasSupplement
    ? supplement.total
    : Math.round((addlParts + addlLabor) * 100) / 100;
  const revisedTotal = Math.round((totals.total + addlTotal) * 100) / 100;
  const finalTotal = hasRevised ? revisedTotal : totals.total;

  const lineTable =
    partLines.length || laborLines.length || supplementLines.length
      ? `<table class="lines">
          <thead><tr><th class="qty">Qty</th><th>Item</th><th class="num">Unit</th><th class="tax"></th><th class="num">Amount</th></tr></thead>
          ${lineGroup('Parts', 'All parts new unless otherwise specified', partLines, totals.parts)}
          ${lineGroup('Labor & services', '', laborLines, totals.labor + otherChargesTotal(totals))}
          ${lineGroup('Additional work', 'Approved after the original estimate', supplementLines, addlTotal, details.revisedDescription)}
        </table>`
      : '';

  const totalRow = (label: string, value: number, className = '') =>
    `<tr class="${className}"><td>${e(label)}</td><td class="num">${money(value)}</td></tr>`;
  const optionalRow = (label: string, value: number) =>
    value ? totalRow(label, value) : '';

  const authorization = (
    title: string,
    by: string,
    method: string,
    day: string,
    time: string,
    calledBy: string,
    phone: string,
  ) => {
    const items = [
      by ? `${e(by)}${method ? ` (${e(method)})` : ''}` : '',
      [date(day), time].filter(Boolean).map(e).join(', '),
      [calledBy, phone].filter(Boolean).map(e).join(' · '),
    ].filter(Boolean);
    return items.length
      ? `<div class="auth"><label>${e(title)}</label><div>${items.join(' · ')}</div></div>`
      : '';
  };
  const authorizations = [
    authorization(
      'Estimate authorized',
      details.estimateAuthorizedBy,
      details.estimateMethod,
      details.estimateDate,
      details.estimateTime,
      details.estimateCalledBy,
      details.estimatePhone,
    ),
    hasRevised
      ? authorization(
          'Additional work authorized',
          details.revisedAuthorizedBy,
          details.revisedMethod,
          details.revisedDate,
          details.revisedTime,
          details.revisedCalledBy,
          details.revisedPhone,
        )
      : '',
  ].join('');

  const additionalNote =
    hasRevised && !supplementLines.length
      ? `<div class="note"><label>Additional work</label><p>${e(details.revisedDescription)}</p><div class="note-split">Parts ${money(addlParts)} · Labor ${money(addlLabor)}</div></div>`
      : '';

  const policy = (text: string) =>
    e(
      text.replaceAll(
        '{deposit}',
        !isBlank && details.depositAmount
          ? money(Number(details.depositAmount))
          : '________',
      ),
    );

  const hasDigitalSignature =
    Boolean(details.signature) &&
    /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
      details.signature,
    );

  const shopNameHeader =
    settings?.shopName?.trim() || 'KATIA Auto Sales & Repairs Inc';
  const shopAddressLine =
    settings?.shopAddress?.trim() || '1005 Rural St, Aurora, IL 60505';
  const shopPhoneLine = settings?.shopPhone?.trim() || '(630) 907-7198';
  const logoSvg = katiaHexBadgeSvg({
    size: 46,
    variant: 'print',
    className: 'brand-logo',
  });

  const vehicleName = [order.vehicleYear, order.vehicleMake, order.vehicleModel]
    .filter(Boolean)
    .join(' ');
  const vehicleFacts = [
    order.vin,
    order.licensePlate,
    order.mileage ? `${order.mileage} mi` : '',
  ]
    .filter(Boolean)
    .map(e)
    .join('<i></i>');
  const cityLine = order.address
    ? [[details.city, details.state].filter(Boolean).join(', '), details.zip]
        .filter(Boolean)
        .join(' ')
    : '';
  const phones = [
    [order.phone, details.phoneExtension].filter(Boolean).join(' ext. '),
    details.homePhone ? `${details.homePhone} home` : '',
  ].filter(Boolean);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(order.orderNumber)}</title><style>
  @font-face {
    font-family: Manrope;
    font-weight: 200 800;
    src: url(data:font/woff2;base64,${MANROPE_WOFF2_BASE64}) format('woff2');
  }
  @page { size: letter portrait; margin: 0.5in 0.5in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body {
    margin: 0;
    padding: 0;
    font: 500 8.5pt/1.4 Manrope, "Segoe UI", Arial, sans-serif;
    color: #0f172a;
  }
  @media screen {
    html, body {
      background: #e2e8f0;
      min-height: 100vh;
    }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 68px 24px 48px;
    }
    .page-sheet {
      width: 100%;
      max-width: 8.5in;
      min-height: 11in;
      background: #ffffff;
      padding: 0.5in 0.6in;
      border-radius: 6px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.15), 0 1px 3px rgba(15, 23, 42, 0.08);
      margin: 0 auto;
    }
  }
  @media print {
    html, body {
      background: #ffffff !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .page-sheet {
      width: 100% !important;
      max-width: none !important;
      min-height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  }
  .write-line {
    border-bottom: 0.75pt solid #cbd5e1;
    min-height: 14pt;
    width: 100%;
    margin-top: 1pt;
  }
  .blank-vehicle-row {
    display: flex;
    gap: 12pt;
    margin-bottom: 5pt;
  }
  .blank-unit {
    flex: 1;
  }
  .blank-vehicle-facts {
    display: flex;
    gap: 12pt;
    font-size: 7.5pt;
  }
  .blank-fact-item {
    flex: 1;
  }
  .blank-lines-table tbody tr {
    height: 18pt;
  }
  .blank-lines-table tbody td {
    border-bottom: 0.5pt solid #cbd5e1;
  }
  .blank-totals-table {
    width: 195pt;
    border-collapse: collapse;
  }
  .blank-totals-table td {
    padding: 3pt 0;
    vertical-align: bottom;
  }
  .blank-totals-table .blank-amount-cell {
    text-align: left !important;
    width: 85pt;
    padding-left: 6pt !important;
    padding-right: 0 !important;
    border-bottom: 0.75pt solid #cbd5e1;
  }
  .blank-totals-table .dollar-sign {
    color: #475569;
    font-weight: 700;
    font-size: 8pt;
    display: inline-block;
  }
  .blank-totals-table .grand .blank-amount-cell {
    border-bottom: 1.25pt solid #0f172a;
    padding-top: 6pt;
  }
  .blank-totals-table .grand .dollar-sign {
    color: #0f172a;
    font-size: 11pt;
    font-weight: 800;
  }
  .total-card-blank .total-blank-line {
    display: flex;
    align-items: flex-end;
    gap: 4pt;
    margin-top: 3pt;
  }
  .total-card-blank .total-dollar {
    font-size: 20pt;
    font-weight: 800;
    color: #94a3b8;
    line-height: 1;
  }
  .total-card-blank .total-write-rule {
    flex: 1;
    border-bottom: 1.5pt solid #475569;
    height: 18pt;
    margin-bottom: 2pt;
  }
  label {
    display: block;
    color: #64748b;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.09em;
    line-height: 1.3;
    margin-bottom: 2pt;
    text-transform: uppercase;
  }
  p { margin: 0; }
  .mono { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; font-weight: 400; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

  header { display: flex; justify-content: space-between; align-items: center; gap: 18pt; }
  .brand-lockup { display: flex; align-items: center; gap: 9pt; min-width: 0; }
  .brand-logo { width: 30pt; height: 30pt; flex-shrink: 0; display: block; }
  .brand-text { min-width: 0; }
  .brand { font-size: 12.5pt; font-weight: 800; letter-spacing: -0.01em; line-height: 1.2; }
  .shop-sub { color: #64748b; font-size: 8pt; line-height: 1.35; }
  .number { flex-shrink: 0; text-align: right; }
  .number label { margin-bottom: 0; }
  .number div { font-size: 12.5pt; font-weight: 800; letter-spacing: -0.01em; line-height: 1.3; }

  .hero {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 22pt;
    margin-top: 10pt;
  }
  .hero-main { flex: 1; min-width: 0; align-self: center; }
  .vehicle { font-size: 22pt; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; }
  .vehicle-facts { color: #475569; font-size: 8pt; margin-top: 6pt; overflow-wrap: anywhere; }
  .vehicle-facts i { display: inline-block; width: 2.5pt; height: 2.5pt; margin: 0 6pt 1.5pt; border-radius: 50%; background: #94a3b8; }
  .total-card {
    background: #0f172a;
    border-radius: 9pt;
    color: #ffffff;
    flex-shrink: 0;
    min-width: 186pt;
    padding: 8pt 14pt 7pt;
  }
  .total-card label { color: #93c5fd; margin-bottom: 3pt; }
  .total-card strong { display: block; font-size: 21pt; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .total-card small { display: block; color: #cbd5e1; font-size: 7.5pt; line-height: 1.35; margin-top: 5pt; }

  .facts {
    display: grid;
    grid-template-columns: 2.3fr repeat(4, 1fr);
    gap: 6pt 12pt;
    margin-top: 10pt;
    padding: 7pt 0;
    border-top: 1pt solid #0f172a;
    border-bottom: 0.75pt solid #e2e8f0;
  }
  .fact { min-width: 0; overflow-wrap: anywhere; }
  .fact > div { font-weight: 600; line-height: 1.35; }
  .fact-customer { grid-row: span 2; }
  .fact-wide { grid-column: span 2; }
  .fact-customer span { display: block; color: #475569; font-size: 7.5pt; font-weight: 500; line-height: 1.3; }
  .request { margin-top: 6pt; }
  .request p { font-weight: 600; line-height: 1.4; }

  .lines { width: 100%; border-collapse: collapse; margin-top: 8pt; }
  .lines thead { display: table-header-group; }
  .lines th {
    color: #64748b;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.09em;
    padding: 0 0 4pt;
    text-align: left;
    text-transform: uppercase;
  }
  .lines th.num { text-align: right; }
  .lines td { padding: 1.6pt 0; vertical-align: top; }
  .lines .qty { width: 30pt; color: #64748b; font-variant-numeric: tabular-nums; }
  .lines .num { width: 66pt; padding-left: 8pt; }
  .lines .tax { width: 26pt; color: #64748b; font-size: 6.5pt; text-align: right; padding-top: 2.4pt; }
  .lines tbody { break-inside: auto; }
  .lines tr { break-inside: avoid; }
  .group td {
    border-top: 1pt solid #0f172a;
    font-size: 9pt;
    font-weight: 800;
    padding: 3pt 0 2pt;
  }
  .group small { color: #64748b; font-size: 7.5pt; font-weight: 500; margin-left: 7pt; }
  .line + .line td { border-top: 0.75pt solid #e2e8f0; }
  .item { font-weight: 600; overflow-wrap: anywhere; }
  .item small { color: #64748b; font-size: 7pt; margin-left: 6pt; white-space: nowrap; }
  .group-detail td { color: #475569; font-size: 7.5pt; line-height: 1.35; padding-top: 0; }
  .kind {
    color: #64748b;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin-left: 6pt;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .amount { font-weight: 700; }
  .no-lines { color: #64748b; margin-top: 16pt; padding: 12pt 0; border-top: 1pt solid #0f172a; }

  .summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 26pt;
    margin-top: 5pt;
    padding-top: 6pt;
    border-top: 1pt solid #0f172a;
    }
  .closing { break-inside: avoid; }
  .summary-notes { flex: 1; min-width: 0; display: grid; gap: 7pt; }
  .note p, .auth > div { font-size: 7.5pt; line-height: 1.4; }
  .note-split { color: #475569; font-size: 7.5pt; font-variant-numeric: tabular-nums; margin-top: 2pt; }
  .totals { width: 186pt; flex-shrink: 0; border-collapse: collapse; }
  .totals td { color: #475569; font-size: 7.5pt; line-height: 1.3; padding: 1pt 0; }
  .totals .num { color: #0f172a; font-weight: 600; }
  .totals .step td { border-top: 0.75pt solid #e2e8f0; color: #0f172a; font-weight: 700; padding-top: 3pt; }
  .totals .grand td { border-top: 1pt solid #0f172a; color: #0f172a; font-size: 11pt; font-weight: 800; padding-top: 5pt; }

  .legal { margin-top: 6pt; padding-top: 6pt; border-top: 0.75pt solid #e2e8f0; }
  .notices { display: grid; grid-template-columns: 1fr 1fr; gap: 16pt; }
  .legal p { color: #475569; font-size: 6.3pt; line-height: 1.38; }
  .legal .auth-text { margin-top: 4pt; }
  .sign-row { display: flex; gap: 16pt; align-items: flex-end; margin-top: 4pt; }
  .sign-main { flex: 1; min-width: 0; }
  .sign-date { width: 96pt; flex-shrink: 0; }
  .sign-line { display: flex; align-items: flex-end; min-height: 21pt; padding-bottom: 2pt; border-bottom: 1pt solid #0f172a; font-weight: 600; }
  .sign-mark { color: #64748b; font-size: 9pt; font-weight: 700; margin-right: 6pt; }
  .signature { height: 34pt; max-width: 100%; object-fit: contain; object-position: left; margin-bottom: -2pt; }
  .sign-row label { margin: 3pt 0 0; }
  .sign-options { flex-shrink: 0; width: 150pt; font-size: 7.5pt; line-height: 1.5; }
  .option-label { color: #64748b; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.09em; margin-right: 7pt; text-transform: uppercase; }
  .choice { display: inline-flex; align-items: center; gap: 3pt; line-height: 9pt; margin-right: 9pt; font-weight: 600; vertical-align: top; }
  .box { display: inline-flex; align-items: center; justify-content: center; width: 9pt; height: 9pt; border: 0.75pt solid #0f172a; border-radius: 2pt; font-size: 7pt; font-weight: 800; line-height: 1; overflow: hidden; }
  .deposit { margin-top: 2pt; color: #475569; }
  </style></head><body>
    <div class="page-sheet">
    <header>
      <div class="brand-lockup">
        ${logoSvg}
        <div class="brand-text">
          <div class="brand">${e(shopNameHeader)}</div>
          <div class="shop-sub">${e(shopAddressLine)} · ${e(shopPhoneLine)}</div>
        </div>
      </div>
      <div class="number">
        <label>Repair order</label>
        <div>${isBlank && (!order.orderNumber || order.orderNumber === 'RO-________') ? 'RO-___________' : e(order.orderNumber)}</div>
      </div>
    </header>

    ${
      isBlank
        ? `<section class="hero hero-blank">
      <div class="hero-main">
        <div class="blank-vehicle-row">
          <div class="blank-unit"><label>Year</label><div class="write-line"></div></div>
          <div class="blank-unit"><label>Make</label><div class="write-line"></div></div>
          <div class="blank-unit"><label>Model</label><div class="write-line"></div></div>
        </div>
        <div class="blank-vehicle-facts mono">
          <div class="blank-fact-item"><label>Serial no. / VIN</label><div class="write-line"></div></div>
          <div class="blank-fact-item"><label>License plate</label><div class="write-line"></div></div>
          <div class="blank-fact-item"><label>Mileage</label><div class="write-line"></div></div>
        </div>
      </div>
      <div class="total-card total-card-blank">
        <label>Total amount</label>
        <div class="total-blank-line"><span class="total-dollar">$</span><span class="total-write-rule"></span></div>
      </div>
    </section>

    <section class="facts blank-facts">
      <div class="fact fact-customer">
        <label>Customer name</label>
        <div class="write-line"></div>
      </div>
      <div class="fact">
        <label>Business / Cell Phone</label>
        <div class="write-line"></div>
      </div>
      <div class="fact">
        <label>Date in</label>
        <div class="write-line"></div>
      </div>
      <div class="fact">
        <label>Delivery date</label>
        <div class="write-line"></div>
      </div>
      <div class="fact fact-customer">
        <label>Street address, City, State, ZIP</label>
        <div class="write-line"></div>
      </div>
      <div class="fact">
        <label>Customer email</label>
        <div class="write-line"></div>
      </div>
      <div class="fact">
        <label>Written by</label>
        <div class="write-line"></div>
      </div>
      <div class="fact">
        <label>Technician</label>
        <div class="write-line"></div>
      </div>
      <div class="fact fact-wide">
        <label>Terms</label>
        <div>Balance due at vehicle pickup</div>
      </div>
      <div class="fact">
        <label>Call when ready</label>
        <div><span class="box"></span> Yes &nbsp;&nbsp; <span class="box"></span> No</div>
      </div>
    </section>

    <section class="request blank-request">
      <label>Services requested / customer concerns / damage notes</label>
      <div class="write-line" style="margin-top: 3pt;"></div>
      <div class="write-line" style="margin-top: 7pt;"></div>
      <div class="write-line" style="margin-top: 7pt;"></div>
    </section>

    <table class="lines blank-lines-table">
      <thead>
        <tr>
          <th class="qty" style="width: 32pt;">Qty</th>
          <th style="width: 65pt;">Part No.</th>
          <th>Work Description / Replacement Parts</th>
          <th class="num" style="width: 60pt;">Unit Price</th>
          <th class="tax" style="width: 30pt;">Tax</th>
          <th class="num" style="width: 65pt;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: 9 })
          .map(
            () =>
              `<tr class="line blank-row">
                <td class="qty">&nbsp;</td>
                <td></td>
                <td></td>
                <td class="num"></td>
                <td class="tax"></td>
                <td class="num amount"></td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>

    <div class="closing">
    <section class="summary">
      <div class="summary-notes"></div>
      <table class="totals blank-totals-table">
        <tr><td>Labor</td><td class="num blank-amount-cell"><span class="dollar-sign">$</span></td></tr>
        <tr><td>Parts</td><td class="num blank-amount-cell"><span class="dollar-sign">$</span></td></tr>
        <tr><td>Sublet / Other</td><td class="num blank-amount-cell"><span class="dollar-sign">$</span></td></tr>
        <tr><td>Tax</td><td class="num blank-amount-cell"><span class="dollar-sign">$</span></td></tr>
        <tr class="grand"><td>Total amount</td><td class="num blank-amount-cell"><span class="dollar-sign">$</span></td></tr>
      </table>
    </section>`
        : `<section class="hero">
      <div class="hero-main">
        <div class="vehicle">${e(vehicleName) || 'Vehicle not specified'}</div>
        ${vehicleFacts ? `<div class="vehicle-facts mono">${vehicleFacts}</div>` : ''}
      </div>
      <div class="total-card">
        <label>${hasRevised ? 'Revised total' : 'Total amount'}</label>
        <strong>${money(finalTotal)}</strong>
        ${
          hasRevised
            ? `<small>Original ${money(totals.total)} + additional ${money(addlTotal)}</small>`
            : totals.tax > 0
              ? `<small>Includes ${money(totals.tax)} ${e(taxLabel.toLowerCase())}</small>`
              : ''
        }
      </div>
    </section>

    <section class="facts">
      <div class="fact fact-customer">
        <label>Customer</label>
        <div>${e(order.customerName) || 'Not specified'}</div>
        ${[
          [order.address, cityLine].filter(Boolean).join(', '),
          phones.join(' · '),
        ]
          .filter(Boolean)
          .map((value) => `<span>${e(value)}</span>`)
          .join('')}
      </div>
      ${fact('Date in', date(order.dateIn))}
      ${fact('Delivery', date(order.datePromised))}
      ${fact('Written by', details.writtenBy)}
      ${fact('Technician', details.technician)}
      ${fact('Customer order', details.customerOrderNumber)}
      ${fact('Call when ready', details.callWhenReady)}
      ${fact('Terms', details.terms, 'fact-wide')}
    </section>

    ${order.concerns ? `<section class="request"><label>Services requested</label><p>${e(order.concerns)}</p></section>` : ''}

    ${lineTable || '<div class="no-lines">No parts or labor have been added to this order.</div>'}

    <div class="closing">
    <section class="summary">
      <div class="summary-notes">
        ${additionalNote}
        ${authorizations}
      </div>
      <table class="totals">
        ${totalRow('Labor', totals.labor)}
        ${totalRow('Parts', totals.parts)}
        ${optionalRow('Other charges', otherChargesTotal(totals))}
        ${totalRow(taxLabel, totals.tax)}
        ${hasRevised ? totalRow('Initial total', totals.total, 'step') + totalRow('Additional work', addlTotal) : ''}
        ${totalRow(hasRevised ? 'Revised total' : 'Total amount', finalTotal, 'grand')}
      </table>
    </section>`
    }

    <section class="legal">
      <div class="notices">
        <p>${policy(details.noticeEnglish)}</p>
        <p lang="es">${policy(details.noticeSpanish)}</p>
      </div>
      <p class="auth-text">${e(details.authorizationText)}</p>
      <div class="sign-row">
        <div class="sign-main">
          <div class="sign-line">
            <span class="sign-mark">X</span>
            ${hasDigitalSignature ? `<img class="signature" src="${details.signature}" alt="Customer signature">` : ''}
          </div>
          <label>Customer signature</label>
        </div>
        <div class="sign-date">
          <div class="sign-line">${isBlank ? '' : e(date(details.signatureDate))}</div>
          <label>Date</label>
        </div>
        <div class="sign-options">
          <span class="option-label">Save old parts</span>
          <span class="choice"><span class="box">${!isBlank && details.saveOldParts === 'Yes' ? '✓' : ''}</span>Yes</span>
          <span class="choice"><span class="box">${!isBlank && details.saveOldParts === 'No' ? '✓' : ''}</span>No</span>
          ${!isBlank && details.depositAmount ? `<div class="deposit">Special order deposit ${money(Number(details.depositAmount))}</div>` : ''}
        </div>
      </div>
    </section>
    </div>
    </div>
  </body></html>`;
}
