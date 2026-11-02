import { katiaHexBadgeSvg } from './logo';
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
  type WorkOrder,
  type TaxSettings,
} from './workOrder';

/** Original landscape form layout, with blank rows for handwritten additions. */
export function classicReceiptHtml(
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
  const field = (label: string, value: unknown, className = '') =>
    `<div class="field ${className}"><label>${e(label)}</label><div>${isBlank ? '&nbsp;' : e(value) || '—'}</div></div>`;

  const totals = chargeTotals(order);
  const otherTotal = otherChargesTotal(totals);
  const taxLabel = order.taxRate?.trim()
    ? `Tax (${order.taxRate.trim()}%)`
    : 'Tax';

  // Parts rows with minimum filler rows to balance the page
  const partLines = isBlank
    ? []
    : order.charges.filter(
        (line) => line.kind === 'parts' && (line.description || line.amount),
      );
  const minPartsRows = isBlank ? 12 : 7;
  const partsHtmlRows = partLines.map(
    (line) =>
      `<tr><td>${e(line.quantity || '1')}</td><td>${e(line.partNumber)}</td><td>${e(line.description)}</td><td class="amount">${line.unitPrice ? money(Number(line.unitPrice)) : '—'}</td><td class="tax-cell">${(line.taxable ?? defaultTaxable(line.kind)) ? 'Tax' : '—'}</td><td class="amount">${money(lineTotal(line))}</td></tr>`,
  );
  for (let i = partLines.length; i < minPartsRows; i++) {
    partsHtmlRows.push(
      `<tr class="blank-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`,
    );
  }

  // Labor & other charges rows with minimum filler rows
  const laborLines = isBlank
    ? []
    : order.charges.filter(
        (line) => line.kind !== 'parts' && (line.description || line.amount),
      );
  const minLaborRows = isBlank ? 10 : 6;
  const laborHtmlRows = laborLines.map(
    (line) =>
      `<tr><td>${e(line.quantity || '1')}</td><td>${e(line.partNumber)}</td><td>${e(line.description)}<small class="line-kind">${e(line.kind)}</small></td><td class="amount">${line.unitPrice ? money(Number(line.unitPrice)) : '—'}</td><td class="tax-cell">${(line.taxable ?? defaultTaxable(line.kind)) ? 'Tax' : '—'}</td><td class="amount">${money(lineTotal(line))}</td></tr>`,
  );
  for (let i = laborLines.length; i < minLaborRows; i++) {
    laborHtmlRows.push(
      `<tr class="blank-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`,
    );
  }

  const partsTable = `<section class="sec-parts"><h2>Parts (all parts new unless otherwise specified)</h2><table class="lines parts-lines"><thead><tr><th style="width:7%">Qty</th><th style="width:23%">Part no.</th><th>Description</th><th style="width:13%">Unit</th><th style="width:8%">Tax</th><th style="width:16%">Amount</th></tr></thead><tbody>${partsHtmlRows.join('')}</tbody><tfoot><tr class="table-subtotal"><td colspan="5">TOTAL PARTS</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.parts)}</td></tr></tfoot></table></section>`;

  const laborTable = `<section class="sec-labor"><h2>Labor / services / other charges</h2><table class="lines labor-lines"><thead><tr><th style="width:7%">Qty</th><th style="width:16%">Part no.</th><th>Description</th><th style="width:13%">Unit</th><th style="width:8%">Tax</th><th style="width:16%">Amount</th></tr></thead><tbody>${laborHtmlRows.join('')}</tbody></table></section>`;

  const supplement = supplementTotals(order);
  const hasSupplement = hasSupplementLines(order);
  const revisedEstimate =
    Math.round((totals.total + supplement.total) * 100) / 100;

  const hasRevised =
    hasSupplement ||
    Boolean(
      details.revisedParts ||
      details.revisedLabor ||
      details.revisedDescription ||
      details.revisedAuthorizedBy,
    );

  const approvalBlock = () => {
    const estAuth = [
      details.estimateAuthorizedBy
        ? `${e(details.estimateAuthorizedBy)}${details.estimateMethod ? ` (${e(details.estimateMethod)})` : ''}`
        : '',
      [details.estimateDate, details.estimateTime].filter(Boolean).join(' '),
      [details.estimateCalledBy, details.estimatePhone]
        .filter(Boolean)
        .join(' · '),
    ]
      .filter(Boolean)
      .join(' | ');

    let revHtml = '';
    if (hasRevised && !isBlank) {
      const parts = moneyValue(details.revisedParts);
      const labor = moneyValue(details.revisedLabor);
      const addlTotal = hasSupplement
        ? supplement.total
        : Math.round((parts + labor) * 100) / 100;
      const finalRev = hasSupplement
        ? revisedEstimate
        : totals.total + addlTotal;

      const revAuth = [
        details.revisedAuthorizedBy
          ? `${e(details.revisedAuthorizedBy)}${details.revisedMethod ? ` (${e(details.revisedMethod)})` : ''}`
          : '',
        [details.revisedDate, details.revisedTime].filter(Boolean).join(' '),
        [details.revisedCalledBy, details.revisedPhone]
          .filter(Boolean)
          .join(' · '),
      ]
        .filter(Boolean)
        .join(' | ');

      revHtml = `
        <div class="approval-card revised-card">
          <div class="card-head">REVISED ESTIMATE / ADDITIONAL WORK</div>
          ${details.revisedDescription ? `<div class="revised-note"><strong>Work:</strong> ${e(details.revisedDescription)}</div>` : ''}
          <div class="stat-grid five">
            <div><label>ADD'L PARTS</label><span>${money(hasSupplement ? supplement.parts : parts)}</span></div>
            <div><label>ADD'L LABOR</label><span>${money(hasSupplement ? supplement.labor : labor)}</span></div>
            <div><label>ADD'L TOTAL</label><span>${money(addlTotal)}</span></div>
            <div><label>ORIGINAL</label><span>${money(totals.total)}</span></div>
            <div class="highlight"><label>REVISED TOTAL</label><strong>${money(finalRev)}</strong></div>
          </div>
          ${revAuth ? `<div class="auth-meta"><strong>Authorized:</strong> ${revAuth}</div>` : ''}
        </div>`;
    }

    return `
      <div class="approvals-container">
        <div class="approval-card">
          <div class="card-head">ESTIMATED COSTS &amp; AUTHORIZATION</div>
          <div class="stat-grid five">
            <div><label>PARTS</label><span>${isBlank ? '&nbsp;' : money(totals.parts)}</span></div>
            <div><label>LABOR</label><span>${isBlank ? '&nbsp;' : money(totals.labor)}</span></div>
            <div><label>OTHER</label><span>${isBlank ? '&nbsp;' : money(otherTotal)}</span></div>
            <div><label>${e(taxLabel)}</label><span>${isBlank ? '&nbsp;' : money(totals.tax)}</span></div>
            <div class="highlight"><label>TOTAL</label><strong>${isBlank ? '&nbsp;' : money(totals.total)}</strong></div>
          </div>
          ${!isBlank && estAuth ? `<div class="auth-meta"><strong>Authorized:</strong> ${estAuth}</div>` : ''}
        </div>
        ${revHtml}
      </div>`;
  };

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

  const signatureBlock = `
    <div class="sign-container">
      <div class="sign-row">
        <div class="sign-main">
          <div class="sign-line-wrap">
            <span class="sign-mark">X</span>
            ${!isBlank && hasDigitalSignature ? `<img class="signature" src="${details.signature}" alt="Customer signature">` : '<div class="signature-pen-space"></div>'}
          </div>
          <div class="sign-caption">CUSTOMER SIGNATURE</div>
        </div>
        <div class="sign-date">
          <div class="sign-line-wrap">
            <div class="signature-pen-space">${isBlank ? '' : e(details.signatureDate)}</div>
          </div>
          <div class="sign-caption">DATE</div>
        </div>
      </div>
      <div class="sign-options">
        <div class="save-parts-block">
          <span class="option-label">SAVE OLD PARTS:</span>
          <span class="checkbox-option"><span class="box">${!isBlank && details.saveOldParts === 'Yes' ? '✓' : ''}</span> YES</span>
          <span class="checkbox-option"><span class="box">${!isBlank && details.saveOldParts === 'No' ? '✓' : ''}</span> NO</span>
        </div>
        ${!isBlank && details.depositAmount ? `<div class="deposit-block"><strong>SPECIAL ORDER DEPOSIT:</strong> ${money(Number(details.depositAmount))}</div>` : ''}
      </div>
    </div>`;

  const shopNameHeader =
    settings?.shopName?.trim() || 'KATIA Auto Sales & Repairs Inc';
  const shopAddressLine =
    settings?.shopAddress?.trim() || '1005 Rural St, Aurora, IL 60505';
  const shopPhoneLine = settings?.shopPhone?.trim() || '(630) 907-7198';
  const logoSvg = katiaHexBadgeSvg({
    size: 42,
    variant: 'print',
    className: 'brand-logo',
  });

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(order.orderNumber)}</title><style>
  @page { size: letter landscape; margin: 0.4in 0.45in; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font: 9.5px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
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
      max-width: 11in;
      min-height: 8.5in;
      background: #ffffff;
      padding: 0.4in 0.5in;
      border-radius: 6px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.15), 0 1px 3px rgba(15, 23, 42, 0.08);
      margin: 0 auto;
      display: flex;
      flex-direction: column;
    }
  }
  @media print {
    html, body {
      background: #ffffff !important;
      margin: 0 !important;
      padding: 0 !important;
      height: 100%;
    }
    .page-sheet {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 755px;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    border-bottom: 2.5px solid #1d4ed8;
    padding-bottom: 5px;
    margin-bottom: 8px;
    flex-shrink: 0;
  }
  .brand-lockup { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  .brand-logo { width: 40px; height: 40px; flex-shrink: 0; display: block; }
  .brand-text { min-width: 0; line-height: 1.2; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.03em; color: #0f172a; }
  .shop-sub { font-size: 9.5px; color: #475569; margin-top: 1px; }
  .number { text-align: right; font-size: 14px; font-weight: 800; color: #0f172a; flex-shrink: 0; line-height: 1.25; }
  .number small { display: block; font-size: 9px; font-weight: normal; color: #475569; margin-top: 2px; }

  /* 2-Column Balanced Master Layout */
  .layout {
    display: flex;
    gap: 10px;
    align-items: stretch;
    flex: 1;
    min-height: 0;
  }
  .left-col {
    width: 41%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
  }
  .right-col {
    width: 59%;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
  }

  h2 {
    margin: 0;
    background: #f1f5f9;
    padding: 3.5px 6px;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
    color: #334155;
    border: 1px solid #cbd5e1;
    border-bottom: 0;
  }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: middle; }
  th { font-size: 8px; color: #475569; background: #f8fafc; font-weight: 700; text-transform: uppercase; }
  td { font-size: 9px; }
  .amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tax-cell { text-align: center; white-space: nowrap; font-size: 8.5px; color: #64748b; }
  .line-kind { display: inline-block; margin-left: 4px; font-size: 7.5px; color: #64748b; background: #f1f5f9; padding: 0 3px; border-radius: 2px; }
  .table-subtotal td { background: #f8fafc; font-weight: 700; font-size: 8.5px; text-align: right; padding: 4px 6px; }
  .table-subtotal .amount { font-size: 9.5px; }
  .blank-row td { height: 18px; border-color: #e2e8f0; }

  /* Policies Box */
  .policies {
    font-size: 7.8px;
    line-height: 1.32;
    padding: 7px 8px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .policies p { margin: 0 0 5px; color: #334155; }
  .policies p:last-of-type { margin-bottom: 0; }
  .sign-container { margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 5px; }
  .sign-row { display: flex; gap: 14px; align-items: flex-end; margin-bottom: 5px; }
  .sign-main { flex: 1; }
  .sign-date { width: 110px; }
  .sign-line-wrap { border-bottom: 1.2px solid #0f172a; min-height: 28px; display: flex; align-items: flex-end; position: relative; padding-bottom: 2px; }
  .sign-mark { font-weight: bold; font-size: 12px; color: #0f172a; margin-right: 5px; }
  .signature-pen-space { flex: 1; min-height: 22px; font-size: 9.5px; }
  .signature { height: 36px; max-width: 100%; object-fit: contain; object-position: left; margin-bottom: -2px; }
  .sign-caption { font-size: 8px; font-weight: 700; color: #64748b; letter-spacing: 0.04em; margin-top: 2.5px; }
  .sign-options { display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; padding-top: 3px; }
  .save-parts-block { display: flex; align-items: center; gap: 10px; font-size: 8.5px; font-weight: 600; }
  .option-label { color: #475569; }
  .checkbox-option { display: inline-flex; align-items: center; gap: 3.5px; }
  .box { display: inline-flex; align-items: center; justify-content: center; width: 11px; height: 11px; border: 1.2px solid #0f172a; border-radius: 2px; font-size: 9px; font-weight: bold; }
  .deposit-block { font-size: 8.5px; color: #1e293b; background: #f8fafc; padding: 2px 5px; border: 1px solid #e2e8f0; border-radius: 2px; }

  /* Customer Info Grid */
  .grid { display: grid; gap: 0; }
  .two { grid-template-columns: 1fr 1fr; }
  .three { grid-template-columns: repeat(3, 1fr); }
  .five { grid-template-columns: repeat(5, 1fr); }
  .field {
    padding: 3px 5px;
    border: 1px solid #cbd5e1;
    min-width: 0;
    overflow-wrap: anywhere;
    background: #ffffff;
    margin-top: -1px;
    margin-left: -1px;
  }
  .field label { display: block; color: #64748b; text-transform: uppercase; font-size: 7.5px; font-weight: 700; margin-bottom: 1px; }
  .field div { font-size: 9.5px; font-weight: 500; color: #0f172a; }
  .field-concern div { white-space: normal; line-height: 1.25; font-size: 8.5px; }

  /* Bottom Financials (Approvals on Left + Totals on Right) */
  .bottom-financials { display: flex; gap: 8px; align-items: stretch; }
  .approvals-side { flex: 1.25; min-width: 0; display: flex; flex-direction: column; gap: 5px; justify-content: space-between; }
  .totals-side { flex: 0.95; min-width: 0; }

  .approval-card { border: 1px solid #cbd5e1; background: #ffffff; padding: 4px 6px; }
  .card-head { font-size: 8px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 3px; }
  .stat-grid { display: grid; gap: 3px; }
  .stat-grid label { display: block; font-size: 7px; color: #64748b; text-transform: uppercase; }
  .stat-grid span, .stat-grid strong { font-size: 8.5px; font-variant-numeric: tabular-nums; }
  .stat-grid .highlight { background: #f8fafc; padding: 1.5px 3.5px; border-radius: 2px; }
  .stat-grid .highlight strong { color: #1d4ed8; }
  .auth-meta { font-size: 7.5px; color: #475569; margin-top: 3px; border-top: 1px dashed #e2e8f0; padding-top: 2px; line-height: 1.2; }
  .revised-note { font-size: 7.8px; color: #334155; margin-bottom: 3px; line-height: 1.2; }

  .totals-table { width: 100%; border: 1px solid #cbd5e1; height: 100%; }
  .totals-table td { padding: 2.5px 5px; font-size: 8.5px; border: 0; border-bottom: 1px solid #f1f5f9; }
  .totals-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals-table td.blank-amount-cell { text-align: left !important; padding-left: 6px !important; color: #475569; font-weight: 700; }
  .grand-row td { background: #f1f5f9; border-top: 2px solid #1d4ed8 !important; border-bottom: 0 !important; font-weight: 800; font-size: 10.5px; color: #0f172a; padding: 4px 6px; }
  .grand-row .amount { color: #1d4ed8; font-size: 11px; }
  </style></head><body>
    <div class="page-sheet">
      <header>
        <div class="brand-lockup">
          ${logoSvg}
          <div class="brand-text">
            <div class="brand">${e(shopNameHeader)}</div>
            <div class="shop-sub">${e(shopAddressLine)} · Tel: ${e(shopPhoneLine)}</div>
          </div>
        </div>
        <div class="number">
          REPAIR ORDER ${isBlank && (!order.orderNumber || order.orderNumber === 'RO-________') ? 'RO-___________' : e(order.orderNumber)}
          <small>Date in: ${isBlank ? '____________' : e(order.dateIn)} · Delivery: ${isBlank ? '____________' : e(order.datePromised) || '—'}</small>
        </div>
      </header>

      <div class="layout">
        <!-- Left Column: Parts Table + Policies & Signature -->
        <div class="left-col">
          ${partsTable}
          <div class="policies">
            <div>
              <p>${policy(details.noticeEnglish)}</p>
              <p lang="es">${policy(details.noticeSpanish)}</p>
              <p>${e(details.authorizationText)}</p>
            </div>
            ${signatureBlock}
          </div>
        </div>

        <!-- Right Column: Customer/Vehicle Grid + Labor Table + Bottom Financials -->
        <div class="right-col">
          <section class="sec-customer">
            <div class="grid two">
              ${field('Customer name', order.customerName)}
              ${field('Customer order no.', details.customerOrderNumber)}
              ${field('Written by', details.writtenBy)}
              ${field('Business phone / ext.', [order.phone, details.phoneExtension].filter(Boolean).join(' ext. '))}
              ${field('Address', order.address)}
              ${field('Home phone', details.homePhone)}
            </div>
            <div class="grid three">
              ${field('City', order.address ? details.city : '')}
              ${field('State', order.address ? details.state : '')}
              ${field('ZIP', order.address ? details.zip : '')}
            </div>
            <div class="grid two">
              ${field('Year, make and model', [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' '))}
              ${field('Serial no. / VIN', order.vin)}
              ${field('License no.', order.licensePlate)}
              ${field('Mileage', order.mileage)}
              ${field('Call when ready', details.callWhenReady || 'Not specified')}
              ${field('Mechanic / technician', details.technician)}
            </div>
            <div class="grid two">
              ${field('Terms', details.terms)}
              ${field('Services requested / description of work', order.concerns, 'field-concern')}
            </div>
          </section>

          ${laborTable}

          <div class="bottom-financials">
            <div class="approvals-side">
              ${approvalBlock()}
            </div>
            <div class="totals-side">
              <table class="totals-table">
                <tr><td>Total labor</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.labor)}</td></tr>
                <tr><td>Total parts</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.parts)}</td></tr>
                <tr><td>Total sublet</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.sublet)}</td></tr>
                <tr><td>Gas, oil and grease</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.fluids)}</td></tr>
                <tr><td>EPA / waste disposal</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.disposal)}</td></tr>
                <tr><td>Other</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.other)}</td></tr>
                <tr><td>${e(taxLabel)}</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.tax)}</td></tr>
                <tr class="grand-row"><td>TOTAL AMOUNT</td><td class="amount ${isBlank ? 'blank-amount-cell' : ''}">${isBlank ? '$' : money(totals.total)}</td></tr>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
}
