import './components.css'
import { useNumberRollup } from './useNumberRollup'

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export default function CurrencyPill({ icon, value, onAdd, className = '' }) {
  const display = useNumberRollup(value)
  return (
    <div className={`g-currency ${className}`}>
      <span className="g-currency-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="g-currency-value">{display.toLocaleString()}</span>
      {onAdd && (
        <button
          type="button"
          className="g-currency-add"
          onClick={onAdd}
          aria-label="Add more"
        >
          +
        </button>
      )}
    </div>
  )
}
