/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'
import Badge from './Badge'

// `tabs`: [{ id, label, badge? }]. Controlled via `value`/`onChange`.
// `premium`: active tab uses the violet gradient instead of sky (premium
// sections only, e.g. Club Wars).
export default function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  premium = false,
}) {
  return (
    <div className="g-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          className={`g-tab ${premium ? 'g-tab-premium' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge != null && (
            <span className="g-tab-badge">
              <Badge kind="count">{tab.badge}</Badge>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
