/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'
import { useNumberRollup } from './useNumberRollup'
import { formatNumber } from '../../utils/format'

export default function CurrencyPill({ icon, value, onAdd, className = '' }) {
  const display = useNumberRollup(value)
  return (
    <div className={`g-currency ${className}`}>
      <span className="g-currency-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="g-currency-value">{formatNumber(display)}</span>
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
