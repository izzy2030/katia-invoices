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

// Manrope ExtraBold, converted to outlines.
const KATIA_WORDMARK_PATH =
  'M27.2 0L9.2 0L9.2-95.0L27.2-95.0L27.2-51.2L63.4-95.0L85.3-95.0L45.5-48.2L87.8 0L65.1 0L27.2-43.3L27.2 0ZM114.9 0L96.4 0L125.5-95.0L152.3-95.0L181.3 0L162.8 0L156.7-19.8L120.9-19.8L114.9 0ZM126.0-36.6L151.5-36.6L138.7-78.2L126.0-36.6ZM231.3 0L213.3 0L213.3-78.3L183.3-78.3L183.3-95.0L261.2-95.0L261.2-78.3L231.3-78.3L231.3 0ZM297.0 0L279.1 0L279.1-95.0L297.0-95.0L297.0 0ZM334.7 0L316.2 0L345.3-95.0L372.1-95.0L401.1 0L382.6 0L376.5-19.8L340.7-19.8L334.7 0ZM345.8-36.6L371.4-36.6L358.5-78.2L345.8-36.6Z';
const KATIA_TAGLINE_PATH =
  'M5.8 0L0.7 0L8.6-25.9L15.9-25.9L23.9 0L18.8 0L17.2-5.4L7.4-5.4L5.8 0ZM8.8-10.0L15.8-10.0L12.2-21.3L8.8-10.0ZM39.9 0.5L39.9 0.5Q36.8 0.5 34.4-0.7Q32.1-2.0 30.7-4.3Q29.4-6.6 29.4-9.7L29.4-9.7L29.4-25.9L34.4-25.9L34.4-9.8Q34.4-8.5 34.8-7.4Q35.2-6.4 36.0-5.6Q36.8-4.9 37.8-4.5Q38.8-4.1 39.9-4.1L39.9-4.1Q41.1-4.1 42.1-4.5Q43.2-4.9 43.9-5.7Q44.7-6.4 45.1-7.5Q45.5-8.5 45.5-9.8L45.5-9.8L45.5-25.9L50.5-25.9L50.5-9.7Q50.5-6.6 49.2-4.3Q47.8-2.0 45.4-0.7Q43.1 0.5 39.9 0.5ZM69.4 0L64.5 0L64.5-21.3L56.4-21.3L56.4-25.9L77.6-25.9L77.6-21.3L69.4-21.3L69.4 0ZM94.6 0.5L94.6 0.5Q90.7 0.5 87.9-1.2Q85.1-2.8 83.6-5.9Q82.0-8.9 82.0-13.0L82.0-13.0Q82.0-17.0 83.6-20.0Q85.1-23.1 87.9-24.8Q90.7-26.5 94.6-26.5L94.6-26.5Q98.5-26.5 101.3-24.8Q104.1-23.1 105.7-20.0Q107.2-17.0 107.2-13.0L107.2-13.0Q107.2-8.9 105.7-5.9Q104.1-2.8 101.3-1.2Q98.5 0.5 94.6 0.5ZM94.6-4.1L94.6-4.1Q97.1-4.0 98.7-5.1Q100.3-6.2 101.2-8.2Q102.0-10.3 102.0-13.0L102.0-13.0Q102.0-15.7 101.2-17.6Q100.3-19.6 98.7-20.7Q97.1-21.8 94.6-21.9L94.6-21.9Q92.1-21.9 90.5-20.8Q88.9-19.7 88.0-17.7Q87.2-15.7 87.2-13.0L87.2-13.0Q87.2-10.3 88.0-8.3Q88.9-6.3 90.5-5.2Q92.1-4.1 94.6-4.1ZM133.8 0.5L133.8 0.5Q130.9 0.5 128.6-0.5Q126.3-1.5 124.8-3.4Q123.3-5.3 122.9-7.9L122.9-7.9L128.0-8.7Q128.5-6.4 130.2-5.2Q131.9-4.0 134.1-4.0L134.1-4.0Q135.3-4.0 136.4-4.4Q137.6-4.8 138.3-5.5Q139.0-6.3 139.0-7.3L139.0-7.3Q139.0-7.7 138.9-8.1Q138.8-8.5 138.5-8.8Q138.2-9.1 137.8-9.4Q137.3-9.7 136.5-9.9L136.5-9.9L129.8-11.9Q129.0-12.1 128.0-12.5Q127.0-12.9 126.1-13.7Q125.1-14.4 124.5-15.6Q123.9-16.8 123.9-18.7L123.9-18.7Q123.9-21.3 125.2-23.0Q126.5-24.8 128.7-25.6Q130.9-26.4 133.6-26.4L133.6-26.4Q136.3-26.4 138.4-25.5Q140.5-24.6 141.9-22.9Q143.3-21.3 144.0-18.8L144.0-18.8L138.7-17.9Q138.4-19.2 137.6-20.1Q136.8-20.9 135.8-21.4Q134.7-21.8 133.5-21.9L133.5-21.9Q132.4-21.9 131.3-21.5Q130.3-21.2 129.7-20.5Q129.0-19.9 129.0-18.9L129.0-18.9Q129.0-18.1 129.6-17.6Q130.1-17.0 130.9-16.7Q131.7-16.4 132.5-16.2L132.5-16.2L137.0-14.9Q138.0-14.7 139.2-14.2Q140.5-13.8 141.6-13.0Q142.7-12.2 143.4-10.9Q144.2-9.7 144.2-7.7L144.2-7.7Q144.2-5.6 143.3-4.1Q142.4-2.5 140.9-1.5Q139.5-0.5 137.6 0.0Q135.7 0.5 133.8 0.5ZM154.4 0L149.3 0L157.2-25.9L164.6-25.9L172.5 0L167.4 0L165.8-5.4L156.0-5.4L154.4 0ZM157.4-10.0L164.4-10.0L160.8-21.3L157.4-10.0ZM195.1 0L179.1 0L179.1-25.9L184.0-25.9L184.0-4.6L195.1-4.6L195.1 0ZM218.1 0L201.2 0L201.2-25.9L218.1-25.9L218.1-21.3L206.1-21.3L206.1-15.8L216.0-15.8L216.0-11.2L206.1-11.2L206.1-4.6L218.1-4.6L218.1 0ZM235.2 0.5L235.2 0.5Q232.3 0.5 230.0-0.5Q227.7-1.5 226.2-3.4Q224.7-5.3 224.4-7.9L224.4-7.9L229.5-8.7Q230.0-6.4 231.7-5.2Q233.4-4.0 235.5-4.0L235.5-4.0Q236.8-4.0 237.9-4.4Q239.0-4.8 239.8-5.5Q240.5-6.3 240.5-7.3L240.5-7.3Q240.5-7.7 240.4-8.1Q240.2-8.5 240.0-8.8Q239.7-9.1 239.2-9.4Q238.7-9.7 238.0-9.9L238.0-9.9L231.2-11.9Q230.5-12.1 229.5-12.5Q228.5-12.9 227.5-13.7Q226.6-14.4 226.0-15.6Q225.4-16.8 225.4-18.7L225.4-18.7Q225.4-21.3 226.7-23.0Q228.0-24.8 230.2-25.6Q232.4-26.4 235.0-26.4L235.0-26.4Q237.7-26.4 239.8-25.5Q241.9-24.6 243.4-22.9Q244.8-21.3 245.4-18.8L245.4-18.8L240.1-17.9Q239.8-19.2 239.1-20.1Q238.3-20.9 237.2-21.4Q236.1-21.8 235.0-21.9L235.0-21.9Q233.8-21.9 232.8-21.5Q231.8-21.2 231.1-20.5Q230.5-19.9 230.5-18.9L230.5-18.9Q230.5-18.1 231.0-17.6Q231.6-17.0 232.3-16.7Q233.1-16.4 234.0-16.2L234.0-16.2L238.5-14.9Q239.5-14.7 240.7-14.2Q241.9-13.8 243.0-13.0Q244.2-12.2 244.9-10.9Q245.6-9.7 245.6-7.7L245.6-7.7Q245.6-5.6 244.8-4.1Q243.9-2.5 242.4-1.5Q240.9-0.5 239.1 0.0Q237.2 0.5 235.2 0.5ZM271.5 0.5L271.5 0.5Q269.3 0.5 267.4-0.1Q265.4-0.8 264.1-2.2L264.1-2.2Q263.1-3.3 262.6-4.7Q262.1-6.0 262.1-7.6L262.1-7.6Q262.1-9.1 262.5-10.6Q263.0-12.0 263.9-13.1L263.9-13.1Q264.2-13.4 264.6-13.7Q264.9-14.0 265.2-14.3L265.2-14.3Q264.3-15.4 263.8-16.5Q263.3-17.6 263.3-19.0L263.3-19.0Q263.3-21.4 264.6-23.2Q265.9-25.1 268.1-25.8L268.1-25.8Q269.0-26.2 269.9-26.3Q270.9-26.4 271.8-26.4L271.8-26.4Q273.5-26.4 275.2-25.8Q276.8-25.3 277.9-24.0L277.9-24.0Q278.6-23.3 279.1-22.4Q279.5-21.6 279.7-20.7L279.7-20.7L274.9-19.7Q274.7-20.4 274.1-21.0L274.1-21.0Q273.6-21.5 272.9-21.7Q272.3-21.8 271.6-21.8L271.6-21.8Q270.6-21.8 269.8-21.5L269.8-21.5Q269.0-21.1 268.6-20.5Q268.2-19.9 268.2-18.9L268.2-18.9Q268.2-18.1 268.5-17.6Q268.9-17.1 269.3-16.7L269.3-16.7Q269.6-16.3 270.1-15.9Q270.5-15.5 271.0-15.0L271.0-15.0L277.0-9.5L277.0-13.9L281.2-13.9L281.2-9.0Q281.2-8.2 281.2-7.3Q281.1-6.4 281.0-5.8L281.0-5.8L284.2-2.8L281.0 0.5L278.7-1.8Q277.6-0.9 276.5-0.4Q275.3 0.2 274.1 0.4L274.1 0.4Q273.4 0.5 272.7 0.5Q272.1 0.5 271.5 0.5ZM271.7-4.1L271.7-4.1Q272.1-4.1 272.5-4.1Q272.9-4.2 273.2-4.2L273.2-4.2Q273.8-4.4 274.3-4.6Q274.8-4.8 275.1-5.0L275.1-5.0L268.8-10.9Q268.4-10.7 268.1-10.5Q267.8-10.2 267.6-10.0L267.6-10.0Q267.3-9.6 267.2-9.1Q267.0-8.5 267.0-7.9L267.0-7.9Q267.0-7.1 267.2-6.5Q267.5-6.0 267.8-5.5L267.8-5.5Q268.4-4.8 269.6-4.4Q270.7-4.1 271.7-4.1ZM305.1 0L300.3 0L300.3-25.9L311.2-25.9Q311.6-25.9 312.2-25.9Q312.9-25.9 313.4-25.8L313.4-25.8Q315.7-25.4 317.2-24.2Q318.6-23.1 319.4-21.3Q320.1-19.5 320.1-17.4L320.1-17.4Q320.1-14.1 318.4-11.8L318.4-11.8Q317.4-10.4 315.7-9.6L315.7-9.6L320.4 0L314.9 0L310.6-8.8L305.1-8.8L305.1 0ZM305.1-21.3L305.1-13.4L311.0-13.4Q311.4-13.4 311.8-13.4Q312.3-13.4 312.6-13.5L312.6-13.5Q313.6-13.8 314.2-14.4Q314.7-15.1 314.9-15.9Q315.1-16.7 315.1-17.4Q315.1-18.1 314.9-18.8Q314.7-19.6 314.2-20.3Q313.6-20.9 312.6-21.2L312.6-21.2Q312.3-21.3 311.8-21.3Q311.4-21.3 311.0-21.3L311.0-21.3L305.1-21.3ZM344.3 0L327.4 0L327.4-25.9L344.3-25.9L344.3-21.3L332.3-21.3L332.3-15.8L342.1-15.8L342.1-11.2L332.3-11.2L332.3-4.6L344.3-4.6L344.3 0ZM356.5 0L351.6 0L351.6-25.9L362.6-25.9Q362.9-25.9 363.6-25.9Q364.2-25.9 364.7-25.8L364.7-25.8Q367.0-25.4 368.5-24.2Q370.0-23.1 370.7-21.3Q371.4-19.5 371.4-17.4L371.4-17.4Q371.4-15.2 370.7-13.4Q370.0-11.6 368.5-10.5Q367.0-9.3 364.7-8.9L364.7-8.9Q364.2-8.9 363.6-8.8Q362.9-8.8 362.6-8.8L362.6-8.8L356.5-8.8L356.5 0ZM356.5-21.3L356.5-13.4L362.3-13.4Q362.7-13.4 363.2-13.4Q363.6-13.4 364.0-13.5L364.0-13.5Q365.0-13.8 365.5-14.4Q366.1-15.1 366.3-15.9Q366.5-16.7 366.5-17.4L366.5-17.4Q366.5-18.1 366.3-18.8Q366.1-19.6 365.5-20.3Q365.0-20.9 364.0-21.2L364.0-21.2Q363.6-21.3 363.2-21.3Q362.7-21.3 362.3-21.3L362.3-21.3L356.5-21.3ZM379.5 0L374.4 0L382.3-25.9L389.6-25.9L397.6 0L392.5 0L390.8-5.4L381.1-5.4L379.5 0ZM382.5-10.0L389.4-10.0L385.9-21.3L382.5-10.0ZM409.1 0L404.2 0L404.2-25.9L409.1-25.9L409.1 0ZM422.4 0L417.5 0L417.5-25.9L428.4-25.9Q428.8-25.9 429.4-25.9Q430.1-25.9 430.6-25.8L430.6-25.8Q432.9-25.4 434.4-24.2Q435.9-23.1 436.6-21.3Q437.3-19.5 437.3-17.4L437.3-17.4Q437.3-14.1 435.6-11.8L435.6-11.8Q434.6-10.4 432.9-9.6L432.9-9.6L437.6 0L432.1 0L427.8-8.8L422.4-8.8L422.4 0ZM422.4-21.3L422.4-13.4L428.2-13.4Q428.6-13.4 429.0-13.4Q429.5-13.4 429.8-13.5L429.8-13.5Q430.8-13.8 431.4-14.4Q431.9-15.1 432.1-15.9Q432.3-16.7 432.3-17.4Q432.3-18.1 432.1-18.8Q431.9-19.6 431.4-20.3Q430.8-20.9 429.8-21.2L429.8-21.2Q429.5-21.3 429.0-21.3Q428.6-21.3 428.2-21.3L428.2-21.3L422.4-21.3ZM454.4 0.5L454.4 0.5Q451.5 0.5 449.2-0.5Q446.9-1.5 445.4-3.4Q443.9-5.3 443.5-7.9L443.5-7.9L448.6-8.7Q449.1-6.4 450.8-5.2Q452.5-4.0 454.7-4.0L454.7-4.0Q455.9-4.0 457.0-4.4Q458.2-4.8 458.9-5.5Q459.6-6.3 459.6-7.3L459.6-7.3Q459.6-7.7 459.5-8.1Q459.4-8.5 459.1-8.8Q458.9-9.1 458.4-9.4Q457.9-9.7 457.1-9.9L457.1-9.9L450.4-11.9Q449.6-12.1 448.6-12.5Q447.6-12.9 446.7-13.7Q445.7-14.4 445.1-15.6Q444.5-16.8 444.5-18.7L444.5-18.7Q444.5-21.3 445.8-23.0Q447.1-24.8 449.3-25.6Q451.5-26.4 454.2-26.4L454.2-26.4Q456.9-26.4 459.0-25.5Q461.1-24.6 462.5-22.9Q463.9-21.3 464.6-18.8L464.6-18.8L459.3-17.9Q459.0-19.2 458.2-20.1Q457.4-20.9 456.4-21.4Q455.3-21.8 454.1-21.9L454.1-21.9Q453.0-21.9 451.9-21.5Q450.9-21.2 450.3-20.5Q449.7-19.9 449.7-18.9L449.7-18.9Q449.7-18.1 450.2-17.6Q450.7-17.0 451.5-16.7Q452.3-16.4 453.1-16.2L453.1-16.2L457.6-14.9Q458.6-14.7 459.8-14.2Q461.1-13.8 462.2-13.0Q463.3-12.2 464.0-10.9Q464.8-9.7 464.8-7.7L464.8-7.7Q464.8-5.6 463.9-4.1Q463.0-2.5 461.6-1.5Q460.1-0.5 458.2 0.0Q456.3 0.5 454.4 0.5ZM487.2 0L482.3 0L482.3-25.9L487.2-25.9L487.2 0ZM500.6 0L495.6 0L495.6-25.9L500.6-25.9L511.8-8.6L511.8-25.9L516.8-25.9L516.8 0L511.8 0L500.6-17.3L500.6 0ZM536.0 0.5L536.0 0.5Q532.1 0.5 529.3-1.2Q526.4-2.8 524.9-5.9Q523.4-8.9 523.4-13.0L523.4-13.0Q523.4-17.0 524.9-20.0Q526.4-23.1 529.3-24.8Q532.1-26.5 536.0-26.5L536.0-26.5Q540.4-26.5 543.5-24.2Q546.5-22.0 547.7-18.3L547.7-18.3L542.8-16.9Q542.1-19.2 540.4-20.5Q538.7-21.9 536.0-21.9L536.0-21.9Q533.5-21.9 531.8-20.8Q530.2-19.7 529.4-17.7Q528.5-15.7 528.5-13.0L528.5-13.0Q528.5-10.3 529.4-8.3Q530.2-6.3 531.8-5.2Q533.5-4.1 536.0-4.1L536.0-4.1Q538.7-4.1 540.4-5.4Q542.1-6.7 542.8-9.0L542.8-9.0L547.7-7.7Q546.5-3.9 543.5-1.7Q540.4 0.5 536.0 0.5ZM558.6 0L553.7 0L553.7-4.9L558.6-4.9L558.6 0Z';

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

/**
 * Horizontal Brand Lockup SVG (900x300) with a transparent background.
 * Use `reversed` on dark surfaces.
 */
export function katiaHorizontalLockupSvg(
  variant: 'color' | 'reversed' = 'color',
): string {
  const reversed = variant === 'reversed';
  const markFill = VARIANT_COLORS[variant];
  const wordFill = reversed ? '#ffffff' : '#0f172a';
  const taglineFill = reversed ? '#cbd5e1' : '#334155';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" role="img" aria-label="Katia Auto Sales &amp; Repairs Inc.">
  <g transform="translate(30, 30) scale(2)" fill="${markFill}">${markPathsSvg(240)}</g>
  <path transform="translate(287.1, 188) scale(1.429)" fill="${wordFill}" d="${KATIA_WORDMARK_PATH}"/>
  <path transform="translate(300, 244)" fill="${taglineFill}" d="${KATIA_TAGLINE_PATH}"/>
</svg>`;
}

/**
 * Google Maps / Google Business Profile Avatar SVG (1024x1024).
 * The mark sits inside the circular safe-zone Google crops the square to.
 */
export function katiaGoogleProfileAvatarSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Katia Auto Sales &amp; Repairs Inc.">
  <rect width="1024" height="1024" fill="${VARIANT_COLORS.color}"/>
  <g transform="translate(116, 116) scale(6.6)" fill="${VARIANT_COLORS.reversed}">${markPathsSvg(1024)}</g>
</svg>`;
}

/**
 * Desktop Application Icon SVG (1024x1024)
 * Places the reversed mark in a rounded square container.
 */
export function katiaAppIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Katia Body Shop App Icon">
  <rect x="24" y="24" width="976" height="976" rx="180" fill="${VARIANT_COLORS.color}"/>
  <g transform="translate(116, 116) scale(6.6)" fill="${VARIANT_COLORS.reversed}">${markPathsSvg(1024)}</g>
</svg>`;
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

/**
 * Generates a self-contained HTML presentation board showcasing all Nut Ring logo
 * variations and live application mockups.
 */
export function katiaBrandShowcaseHtml(): string {
  const badgeSvg = katiaHexBadgeSvg({ size: 156, variant: 'reversed' });
  const horizSvg = katiaHorizontalLockupSvg('reversed');
  const googleSvg = katiaGoogleProfileAvatarSvg();
  const appIconSvg = katiaAppIconSvg();
  const emailHeader = buildKatiaEmailBrandHeader();

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      padding: 34px 42px;
      width: 1440px;
      height: 1020px;
      overflow: hidden;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 16px;
      margin-bottom: 22px;
    }
    .top-bar .tag {
      display: inline-block;
      background: #172554;
      border: 1px solid #2563eb;
      color: #60a5fa;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.16em;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .top-bar h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #ffffff;
    }
    .top-bar p {
      font-size: 13px;
      color: #94a3b8;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 22px;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 18px 22px;
    }
    .card-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: #38bdf8;
      text-transform: uppercase;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-label span {
      color: #64748b;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .horiz-wrap svg {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 10px;
    }
    .three-up {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .icon-box {
      background: #131c31;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .icon-box .preview {
      width: 148px;
      height: 148px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }
    .icon-box .preview svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .icon-box .preview.circle svg {
      border-radius: 50%;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    }
    .icon-box h4 {
      font-size: 13px;
      font-weight: 800;
      color: #f8fafc;
      margin-bottom: 4px;
    }
    .icon-box p {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.38;
    }
    .gbp-card {
      background: #ffffff;
      color: #0f172a;
      border-radius: 10px;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: 1px solid #e2e8f0;
    }
    .gbp-avatar {
      width: 82px;
      height: 82px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      border: 2px solid #2563eb;
    }
    .gbp-avatar svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .gbp-info h3 {
      font-size: 17px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .gbp-stars {
      color: #f59e0b;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .gbp-meta {
      font-size: 12px;
      color: #475569;
      line-height: 1.4;
    }
  </style></head><body>
    <div class="top-bar">
      <div>
        <div class="tag">NUT RING LOGO</div>
        <h1>Katia Auto Sales &amp; Repairs Inc. — Brand Identity Suite</h1>
      </div>
      <p>1005 Rural St, Aurora, IL 60505 · (630) 907-7198 · Vector SVG &amp; High-Res PNG Assets</p>
    </div>

    <div class="card" style="margin-bottom: 20px;">
      <div class="card-label">1. Primary Horizontal Brand Lockup <span>assets/katia-logo-horizontal-reversed.svg · 900×300</span></div>
      <div class="horiz-wrap">${horizSvg}</div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-label">2. Icon, Badge &amp; Avatar Variations <span>Square, Hex &amp; Circular Safe-Zone</span></div>
        <div class="three-up">
          <div class="icon-box">
            <div class="preview">${badgeSvg}</div>
            <h4>Primary Hex Badge</h4>
            <p>Single-color lug-nut ring around a solid K hexagon</p>
          </div>
          <div class="icon-box">
            <div class="preview">${appIconSvg}</div>
            <h4>Desktop App Icon</h4>
            <p>Reversed mark in a rounded square container</p>
          </div>
          <div class="icon-box">
            <div class="preview circle">${googleSvg}</div>
            <h4>Google Maps Avatar</h4>
            <p>Reversed mark inside the circular crop safe-zone</p>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 18px;">
        <div class="card">
          <div class="card-label">3. Google Business Profile Live Mockup <span>assets/katia-logo-google-avatar.png</span></div>
          <div class="gbp-card">
            <div class="gbp-avatar">${googleSvg}</div>
            <div class="gbp-info">
              <h3>Katia Auto Sales &amp; Repairs Inc</h3>
              <div class="gbp-stars">★★★★★ <span style="color:#64748b;font-weight:500;">Motor vehicle dealer &amp; body shop in Aurora, IL</span></div>
              <div class="gbp-meta">1005 Rural St, Aurora, IL 60505 · (630) 907-7198<br><span style="color:#059669;font-weight:700;">Open</span> · Closes 5 PM</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-label">4. Customer HTML Email Header <span>src/main.ts &amp; src/gmailService.ts</span></div>
          <div style="background:#ffffff; padding: 16px 18px; border-radius: 10px;">
            ${emailHeader}
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
}
