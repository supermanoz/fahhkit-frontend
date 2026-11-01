/* eslint-disable react/prop-types -- no prop-types dependency in this project */

// Hand-drawn Fahhcoin pile for the Shop's pack cards - grows from a single
// coin to a small hoard as `tier` climbs, same enamel-gold look as the HUD's
// .game-coin (radial gradient + dark rim) recreated as SVG so it scales
// crisply at any card size instead of tiling a raster icon.
const MAX_COINS = 6
// Deterministic left/right scatter per coin index (not random) so the pile
// looks tumbled rather than a perfectly straight column, and stays identical
// between renders/SSR.
const JITTER_X = [0, 10, -8, 5, -11, 7]

export default function CoinStack({ tier = 0, size = 72, className = '' }) {
  const count = Math.min(MAX_COINS, Math.max(1, tier + 1))
  const gradientId = `coin-stack-gold-${tier}`
  const coins = Array.from({ length: count }, (_, i) => i)
  // Back-to-front draw order so higher coins overlap the ones below them.
  const width = 120
  const height = 60 + count * 11
  const baseY = height - 22

  return (
    <svg
      className={`coin-stack ${className}`}
      width={size}
      height={(size * height) / width}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} cx="42%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#ffe95e" />
          <stop offset="52%" stopColor="#ffd21f" />
          <stop offset="70%" stopColor="#ffb800" />
          <stop offset="100%" stopColor="#c98600" />
        </radialGradient>
      </defs>
      {coins.map((i) => {
        const cx = width / 2 + JITTER_X[i % JITTER_X.length]
        const cy = baseY - i * 11
        return (
          <g key={i}>
            {/* Dark rim/edge - the coin's visible thickness. */}
            <ellipse
              cx={cx}
              cy={cy + 4}
              rx={26}
              ry={15}
              fill="#8a5a00"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="1.5"
            />
            {/* Enamel face. */}
            <ellipse
              cx={cx}
              cy={cy}
              rx={26}
              ry={15}
              fill={`url(#${gradientId})`}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="1.5"
            />
            {/* Top-left glint, same as .game-coin::before. */}
            <ellipse
              cx={cx - 9}
              cy={cy - 5}
              rx={6}
              ry={3}
              fill="rgba(255,255,255,0.75)"
            />
          </g>
        )
      })}
    </svg>
  )
}
