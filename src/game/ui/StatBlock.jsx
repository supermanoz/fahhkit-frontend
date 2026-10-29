import './components.css'
import { useNumberRollup } from './useNumberRollup'

// `value` can be a number (gets the roll-up animation) or a ready-made
// string (e.g. "12:04" for a pace/time display, which rolling up makes no
// sense for). StatBlock text is always >=20px (--text-3xl), so the
// >=20px-outline exception legitimately applies by default. `gold`: only
// for genuinely currency/trophy/rank-1 stats - everything else (distance,
// pace, run score...) stays white.
// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export default function StatBlock({
  value,
  label,
  outlined = true,
  gold = false,
  className = '',
}) {
  const isNumber = typeof value === 'number'
  const display = useNumberRollup(isNumber ? value : 0)
  return (
    <div className={`g-stat ${className}`}>
      <span
        className={`g-stat-value ${gold ? 'g-stat-gold' : ''} ${outlined ? 'text-outlined' : ''} tabular-nums`}
      >
        {isNumber ? display.toLocaleString() : value}
      </span>
      <span className="g-stat-label">{label}</span>
    </div>
  )
}
