/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'

export default function ProgressBar({
  value,
  max = 100,
  color = 'green',
  label,
  className = '',
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      className={`g-progress ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`g-progress-fill g-progress-${color}`}
        style={{ width: `${pct}%` }}
      />
      {label && <span className="g-progress-label">{label}</span>}
    </div>
  )
}
