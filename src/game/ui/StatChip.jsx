/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './arena.css'

// One stat as an icon chip: icon, a big display-font value (tabular numbers)
// and a small label in the body font. `muted` is for an empty value such as
// "No races yet" (smaller, quieter text).
export default function StatChip({
  icon,
  label,
  value,
  muted = false,
  tone = 'blue',
  className = '',
}) {
  return (
    <div className={`g-stat-chip is-${tone} ${className}`}>
      <span className="g-stat-chip-icon" aria-hidden="true">
        {icon}
      </span>
      <span className={`g-stat-chip-value${muted ? ' is-muted' : ''}`}>
        {value}
      </span>
      <span className="g-stat-chip-label">{label}</span>
    </div>
  )
}
