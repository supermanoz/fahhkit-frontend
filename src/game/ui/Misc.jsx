import { useState } from 'react'
import './components.css'
import { useGameSound } from './useGameSound'

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function Ribbon({ children, className = '' }) {
  return <span className={`g-ribbon ${className}`}>{children}</span>
}

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function Divider({ className = '' }) {
  return <div className={`g-divider ${className}`} role="separator" />
}

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function IconButton({ icon, label, onClick, className = '', ...rest }) {
  const { playTap } = useGameSound()
  return (
    <button
      type="button"
      className={`g-icon-btn g-press ${className}`}
      aria-label={label}
      onClick={(e) => {
        playTap()
        onClick?.(e)
      }}
      {...rest}
    >
      {icon}
    </button>
  )
}

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function Tooltip({ label, children }) {
  const [visible, setVisible] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className="g-tooltip"
          style={{
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
          }}
          role="tooltip"
        >
          {label}
        </span>
      )}
    </span>
  )
}

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export function Skeleton({
  width = '100%',
  height = 16,
  round = false,
  className = '',
}) {
  return (
    <span
      className={`g-skeleton ${className}`}
      style={{
        display: 'block',
        width,
        height,
        borderRadius: round ? '50%' : undefined,
      }}
      aria-hidden="true"
    />
  )
}
