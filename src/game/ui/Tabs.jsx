/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './components.css'
import Badge from './Badge'

// `tabs`: [{ id, label, badge?, icon?, ariaLabel? }]. Controlled via
// `value`/`onChange`.
// `premium`: active tab uses the violet gradient instead of sky (premium
// sections only, e.g. Club Wars).
// `accent="shop"`: selected = the shop purple fill with white text, the rest
// cream with dark text (the Leaderboard's selectors). `size="sm"`: a smaller,
// quieter secondary row (still a 40px+ tap target).
export default function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  premium = false,
  accent,
  size,
  className = '',
}) {
  return (
    <div
      className={`g-tabs ${accent ? `g-tabs-${accent}` : ''} ${size ? `g-tabs-${size}` : ''} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          aria-label={tab.ariaLabel}
          title={tab.ariaLabel}
          className={`g-tab ${premium ? 'g-tab-premium' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span className="g-tab-label">{tab.label}</span>
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
