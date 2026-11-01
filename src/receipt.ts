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

export function receiptHtml(raw: WorkOrder, settings?: TaxSettings) {
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
  const field = (label: string, value: unknown) =>
    `<div class="field"><label>${e(label)}</label><div>${e(value) || '—'}</div></div>`;
  const totals = chargeTotals(order);
  const otherTotal = otherChargesTotal(totals);
  const taxLabel = order.taxRate?.trim()
    ? `Tax (${order.taxRate.trim()}%)`
    : 'Tax';
  const rows = (parts: boolean) =>
    order.charges
      .filter(
        (line) =>
          (line.kind === 'parts') === parts &&
          (line.description || line.amount),
      )
      .map(
        (line) =>
          `<tr><td>${e(line.quantity || '1')}</td><td>${e(line.partNumber)}</td><td>${e(line.description)}${!parts ? `<small>${e(line.kind)}</small>` : ''}</td><td class="amount">${line.unitPrice ? money(Number(line.unitPrice)) : '—'}</td><td class="tax-cell">${(line.taxable ?? defaultTaxable(line.kind)) ? 'Tax' : '—'}</td><td class="amount">${money(lineTotal(line))}</td></tr>`,
      )
      .join('') || '<tr><td colspan="6">—</td></tr>';
  const table = (title: string, parts: boolean) =>
    `<section><h2>${title}</h2><table class="lines"><thead><tr><th>Qty</th><th>Part no.</th><th>Description</th><th>Unit</th><th>Tax</th><th>Amount</th></tr></thead><tbody>${rows(parts)}</tbody></table></section>`;
  const supplement = supplementTotals(order);
  const hasSupplement = hasSupplementLines(order);
  const revisedEstimate =
    Math.round((totals.total + supplement.total) * 100) / 100;
  const supplementRows =
    (order.revisedCharges ?? [])
      .filter(
        (line) =>
          line.description || line.partNumber || line.amount || line.unitPrice,
      )
      .map(
        (line) =>
          `<tr><td>${e(line.quantity || '1')}</td><td>${e(line.partNumber)}</td><td>${e(line.description)}<small>${e(line.kind)}</small></td><td class="amount">${line.unitPrice ? money(Number(line.unitPrice)) : '—'}</td><td class="tax-cell">${(line.taxable ?? defaultTaxable(line.kind)) ? 'Tax' : '—'}</td><td class="amount">${money(lineTotal(line))}</td></tr>`,
      )
      .join('') || '<tr><td colspan="6">—</td></tr>';
  const supplementTable = `<table class="lines supplement"><thead><tr><th>Qty</th><th>Part no.</th><th>Description</th><th>Unit</th><th>Tax</th><th>Amount</th></tr></thead><tbody>${supplementRows}</tbody></table>`;
  const approval = (prefix: 'estimate' | 'revised', title: string) => {
    const get = (suffix: string) =>
      (details as Record<string, string>)[prefix + suffix] || '';
    const authorization = `<div class="grid two">${field('Authorized by', get('AuthorizedBy'))}${field('Authorization method', get('Method'))}</div><div class="grid four">${field('Date', get('Date'))}${field('Time', get('Time'))}${field('Called by', get('CalledBy'))}${field('Phone', get('Phone'))}</div>`;
    if (prefix === 'estimate')
      return `<section class="approval"><h2>${title}</h2><div class="grid five">${field('Parts', money(totals.parts))}${field('Labor', money(totals.labor))}${field('Other charges', money(otherTotal))}${field(taxLabel, money(totals.tax))}${field('Total', money(totals.total))}</div>${authorization}</section>`;
    if (hasSupplement)
      return `<section class="approval"><h2>${title}</h2>${field('Additional work', details.revisedDescription)}${supplementTable}<div class="grid five">${field('Additional parts', money(supplement.parts))}${field('Additional labor', money(supplement.labor))}${field('Other charges', money(otherChargesTotal(supplement)))}${field(taxLabel, money(supplement.tax))}${field('Additional total', money(supplement.total))}</div><div class="grid two">${field('Original estimate', money(totals.total))}${field('Revised estimate', money(revisedEstimate))}</div>${authorization}</section>`;
    const parts = moneyValue(get('Parts')),
      labor = moneyValue(get('Labor')),
      additional = Math.round((parts + labor) * 100) / 100,
      revised = parts || labor;
    return `<section class="approval"><h2>${title}</h2>${field('Additional work', details.revisedDescription)}<div class="grid five">${field('Additional parts', parts ? money(parts) : '')}${field('Additional labor', labor ? money(labor) : '')}${field('Additional total', revised ? money(additional) : '')}${field('Original estimate', money(totals.total))}${field('Revised estimate', revised ? money(totals.total + additional) : '')}</div>${authorization}</section>`;
  };
  const policy = (text: string) =>
    e(
      text.replaceAll(
        '{deposit}',
        details.depositAmount
          ? money(Number(details.depositAmount))
          : '________',
      ),
    );
  const signature =
    /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
      details.signature,
    )
      ? `<img class="signature" src="${details.signature}" alt="Customer signature">`
      : '<div class="signature-blank"></div>';
  const shopNameHeader =
    settings?.shopName?.trim() || 'KATIA Auto Sales & Repairs Inc';
  const shopNameWords = shopNameHeader.split(' ');
  const shopBrandWord = shopNameWords[0] || 'KATIA';
  const shopRestWords = shopNameWords.slice(1).join(' ');
  const shopAddressLine =
    settings?.shopAddress?.trim() || '1005 Rural St, Aurora, IL 60505';
  const shopPhoneLine = settings?.shopPhone?.trim() || '(630) 907-7198';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(order.orderNumber)}</title><style>
  @page{size:letter landscape;margin:.35in}*{box-sizing:border-box}body{margin:0;font:12px/1.45 Arial,sans-serif;color:#17243b}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2563eb;padding-bottom:8px;margin-bottom:10px}.brand{font-size:26px;font-weight:800;letter-spacing:.08em}.number{text-align:right;font-size:14px;font-weight:bold}small{display:block;font-size:10px;color:#526176;margin-top:2px}.grid{display:grid;gap:0}.two{grid-template-columns:1fr 1fr}.three{grid-template-columns:repeat(3,1fr)}.four{grid-template-columns:repeat(4,1fr)}.five{grid-template-columns:repeat(5,1fr)}.field{padding:5px 6px;border:1px solid #cbd5e1;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}.field label{display:block;color:#526176;text-transform:uppercase;font-size:10px;margin-bottom:3px}.layout{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}.stack{display:grid;gap:10px;align-content:start}h2{margin:0;background:#eef3fa;padding:5px 6px;font-size:11px;text-transform:uppercase;border:1px solid #cbd5e1}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{font-size:10px;color:#526176}.lines th:nth-child(1){width:6%}.lines th:nth-child(2){width:16%}.lines th:nth-child(4){width:10%}.lines th:nth-child(5){width:7%}.lines th:last-child{width:14%}.amount{text-align:right;white-space:nowrap}.tax-cell{text-align:center;white-space:nowrap}.totals{margin-left:auto;width:100%}.totals td:last-child{text-align:right}.grand{font-weight:bold;font-size:16px;background:#eef3fa}.policies{font-size:10px;line-height:1.4;white-space:pre-wrap;padding:8px;border:1px solid #cbd5e1}.policies p{margin:0 0 7px}.signature{height:50px;max-width:100%;object-fit:contain;object-position:left}.signature-blank{height:40px;border-bottom:1px solid #64748b}tr{break-inside:avoid}section,.approval{break-inside:auto}.supplement{margin:6px 0}thead{display:table-header-group}
  </style></head><body><header><div><div class="brand">${e(shopBrandWord)}</div>${e(shopRestWords)}<small>${e(shopAddressLine)} · Tel: ${e(shopPhoneLine)}</small></div><div class="number">REPAIR ORDER ${e(order.orderNumber)}<small>Date in: ${e(order.dateIn)} · Date promised: ${e(order.datePromised) || '—'}</small></div></header>
  <div class="layout"><div class="stack">${table('Parts (all parts new unless otherwise specified)', true)}<div class="policies"><p>${policy(details.noticeEnglish)}</p><p lang="es">${policy(details.noticeSpanish)}</p><p>${e(details.authorizationText)}</p>${signature}<div class="grid two">${field('Customer signature / date', details.signatureDate)}${field('Save old parts', details.saveOldParts || 'Not specified')}</div>${field('Special-order deposit', details.depositAmount ? money(Number(details.depositAmount)) : '')}</div></div>
  <div class="stack"><section><div class="grid two">${field('Customer name', order.customerName)}${field('Customer order no.', details.customerOrderNumber)}${field('Written by', details.writtenBy)}${field('Business phone / ext.', [order.phone, details.phoneExtension].filter(Boolean).join(' ext. '))}${field('Address', order.address)}${field('Home phone', details.homePhone)}</div><div class="grid three">${field('City', details.city)}${field('State', details.state)}${field('ZIP', details.zip)}</div><div class="grid two">${field('Year, make and model', [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' '))}${field('Serial no. / VIN', order.vin)}${field('License no.', order.licensePlate)}${field('Mileage', order.mileage)}${field('Call when ready', details.callWhenReady || 'Not specified')}${field('Mechanic / technician', details.technician)}</div>${field('Terms', details.terms)}${field('Services requested / description of work', order.concerns)}</section>${table('Labor / services / other charges', false)}${approval('estimate', 'Estimated costs and authorization')}${approval('revised', 'Revised estimate / additional work')}<table class="totals">${[
    ['Total labor', totals.labor],
    ['Total parts', totals.parts],
    ['Total sublet', totals.sublet],
    ['Gas, oil and grease', totals.fluids],
    ['EPA / waste disposal', totals.disposal],
    ['Other', totals.other],
    [taxLabel, totals.tax],
  ]
    .map(
      ([label, value]) =>
        `<tr><td>${label}</td><td>${money(Number(value))}</td></tr>`,
    )
    .join(
      '',
    )}<tr class="grand"><td>ESTIMATE TOTAL</td><td>${money(totals.total)}</td></tr></table></div></div></body></html>`;
}
