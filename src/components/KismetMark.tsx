/**
 * Kismet brand mark — abstract relationship constellation.
 * Five nodes connected by paths, stroked with the Kismet gradient
 * (deep blue → bright blue → orange → red). No hearts, no faces.
 */
export function KismetMark({
  size = 40,
  className,
  title = "Kismet",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const id = "kismet-mark-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#092A75" />
          <stop offset="40%" stopColor="#126BFF" />
          <stop offset="75%" stopColor="#FF8A1F" />
          <stop offset="100%" stopColor="#FF3B30" />
        </linearGradient>
      </defs>

      {/* Connecting paths */}
      <g stroke={`url(#${id})`} strokeWidth="2.25" strokeLinecap="round">
        <line x1="14" y1="18" x2="32" y2="32" />
        <line x1="32" y1="32" x2="50" y2="14" />
        <line x1="32" y1="32" x2="48" y2="48" />
        <line x1="32" y1="32" x2="16" y2="50" />
        <line x1="14" y1="18" x2="50" y2="14" />
      </g>

      {/* Nodes */}
      <g fill={`url(#${id})`}>
        <circle cx="14" cy="18" r="3.5" />
        <circle cx="50" cy="14" r="3" />
        <circle cx="48" cy="48" r="3" />
        <circle cx="16" cy="50" r="3" />
        <circle cx="32" cy="32" r="4.5" />
      </g>
    </svg>
  );
}

export default KismetMark;
