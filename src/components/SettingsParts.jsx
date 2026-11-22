/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './GameSettings.css'

// Building blocks of the Settings screen (GameSettings.jsx). Kept apart so
// NotificationsSection / MapStylePicker can share the exact same switch.

// Grouped card with a small section header.
export function SettingsCard({ title, id, children, className = '' }) {
  return (
    <section
      className={`set-card ${className}`}
      aria-labelledby={`set-${id}-title`}
      data-testid={`settings-${id}`}
    >
      <h3 className="set-card-title" id={`set-${id}-title`}>
        {title}
      </h3>
      <div className="set-card-body">{children}</div>
    </section>
  )
}

// The switch with its state as TEXT ("On" / "Off") beside it, so on/off never
// depends on colour alone. Decorative for assistive tech: the row itself is
// role="switch" with aria-checked.
export function OnOffSwitch({ on }) {
  return (
    <span className="set-switch" aria-hidden="true">
      <span className={`set-switch-text${on ? ' is-on' : ''}`}>
        {on ? 'On' : 'Off'}
      </span>
      <span className={`game-switch ${on ? 'is-on' : ''}`}>
        <span className="game-switch-knob" />
      </span>
    </span>
  )
}

// Icon coin + title + one short helper line (the left half of every row).
export function RowLabel({ Icon, title, sub }) {
  return (
    <span className="game-settings-row-label">
      <span className="game-settings-row-icon">
        <span className="game-settings-row-icon-badge" aria-hidden="true">
          <Icon />
        </span>
      </span>
      <span className="game-settings-row-text">
        {title}
        {sub ? <span className="game-settings-row-sub">{sub}</span> : null}
      </span>
    </span>
  )
}

export function SwitchRow({
  Icon,
  title,
  sub,
  checked,
  onToggle,
  disabled = false,
  testId,
  className = '',
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`game-settings-row ${className}`}
      data-testid={testId}
      onClick={onToggle}
    >
      <RowLabel Icon={Icon} title={title} sub={sub} />
      <OnOffSwitch on={checked} />
    </button>
  )
}
