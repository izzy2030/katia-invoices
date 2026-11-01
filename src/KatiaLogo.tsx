import { katiaMarkPaths } from './logo';

export interface KatiaLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * React SVG component for the Nut Ring mark. Defaults to `currentColor` so it
 * follows the active theme.
 */
export default function KatiaLogo({
  size = 40,
  color = 'currentColor',
  className,
}: KatiaLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill={color}
      role="img"
      aria-label="Katia Auto Sales & Repairs"
      className={className}
    >
      {katiaMarkPaths(size).map((d) => (
        <path key={d} fillRule="evenodd" d={d} />
      ))}
    </svg>
  );
}
