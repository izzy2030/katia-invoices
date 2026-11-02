/**
 * Katia Auto Sales & Repairs Inc. — Nut Ring logo system.
 *
 * A single-color lug-nut mark: an outer hexagon ring around a solid hexagon
 * with a knocked-out 'K'. Below 24px the ring gap closes up, so the mark
 * falls back to the plain solid hexagon. All artwork is outlined paths, so it
 * renders the same whether or not Manrope is installed.
 */

export type LogoVariant = 'color' | 'print' | 'reversed';

export interface LogoSvgOptions {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}

const KATIA_MARK_SMALL_SIZE = 24;
const KATIA_MARK_PATHS = [
  'M60 4L109 32V88L60 116L11 88V32Z M60 10.7L103.1 35.4V84.6L60 109.3L16.9 84.6V35.4Z',
  'M60 16.3L98.2 38.2V81.8L60 103.7L21.8 81.8V38.2Z M39.5 35.9H52.4V52.3L66.2 35.9H82.5L63.6 59.1L83.4 84.1H67L52.4 65.2V84.1H39.5Z',
];
const KATIA_MARK_SMALL_PATHS = [
  'M60 4L109 32V88L60 116L11 88V32Z M36 32H51V51L67 32H86L64 59L87 88H68L51 66V88H36Z',
];

const VARIANT_COLORS: Record<LogoVariant, string> = {
  color: '#1d4ed8',
  print: '#0f172a',
  reversed: '#ffffff',
};

/** Paths for the 120×120 mark, chosen for the size it will render at. */
export function katiaMarkPaths(size: number): string[] {
  return size < KATIA_MARK_SMALL_SIZE
    ? KATIA_MARK_SMALL_PATHS
    : KATIA_MARK_PATHS;
}

function markPathsSvg(size: number): string {
  return katiaMarkPaths(size)
    .map((d) => `<path fill-rule="evenodd" d="${d}"/>`)
    .join('');
}

/**
 * Primary Nut Ring mark SVG string.
 */
export function katiaHexBadgeSvg(options: LogoSvgOptions = {}): string {
  const size = options.size ?? 64;
  const fill = VARIANT_COLORS[options.variant ?? 'color'];
  const cls = options.className ? ` class="${options.className}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120" fill="${fill}" role="img" aria-label="Katia Auto Sales &amp; Repairs"${cls}>${markPathsSvg(size)}</svg>`;
}

function escapeLogoHtml(value: string): string {
  return value.replace(
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
}

/**
 * Generates an HTML email header block featuring the Nut Ring mark
 * alongside the shop name, address, and phone number.
 * Includes an overflow-clipped HTML monogram fallback beneath the block-level SVG
 * so email clients that strip inline <svg> tags still render a crisp 'K' badge.
 */
export function buildKatiaEmailBrandHeader(options?: {
  shopName?: string;
  subtitle?: string;
}): string {
  const rawName = escapeLogoHtml(
    (
      options?.shopName?.trim() || 'KATIA AUTO SALES & REPAIRS INC.'
    ).toUpperCase(),
  );
  const subtitle = escapeLogoHtml(
    options?.subtitle?.trim() ||
      '1005 Rural St, Aurora, IL 60505 · Tel: (630) 907-7198',
  );
  const badgeSvg = katiaHexBadgeSvg({
    size: 48,
    variant: 'reversed',
  }).replace('<svg ', '<svg style="display:block;width:48px;height:48px;" ');

  return `
    <div style="margin-bottom: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 16px;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 56px; vertical-align: middle; padding-right: 14px;">
            <div style="width: 48px; height: 48px; border-radius: 10px; background: #0f172a; border: 1px solid #2563eb; display: inline-block; line-height: 0; overflow: hidden; text-align: center; box-sizing: border-box;">
              ${badgeSvg}
              <div data-email-fallback="true" aria-hidden="true" style="width: 46px; height: 46px; line-height: 46px; font-family: Arial, sans-serif; font-size: 24px; font-weight: 900; color: #ffffff; background: #0f172a; text-align: center;">K</div>
            </div>
          </td>
          <td style="vertical-align: middle;">
            <div style="font-size: 10px; font-weight: 800; color: #2563eb; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 2px;">
              PRECISION AUTO SALES &amp; BODY SHOP · AURORA, IL
            </div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 0.03em; line-height: 1.2;">
              ${rawName}
            </h1>
            <p style="margin: 3px 0 0; font-size: 13px; color: #64748b; line-height: 1.4;">
              ${subtitle}
            </p>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}
