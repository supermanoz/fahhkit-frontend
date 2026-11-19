/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'

// Small presentational pieces shared by every in-game auth screen, so Sign
// In / Create Account / Forgot / Reset all look and behave the same.

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

function NoticeIcon({ kind }) {
  if (kind === 'success') {
    return (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M7.8 12.4l3 3 5.6-6.4" />
      </svg>
    )
  }
  if (kind === 'error') {
    return (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 7.2v5.6M12 16.4v.1" />
      </svg>
    )
  }
  // warning (amber): a triangle with an exclamation mark
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3.6l9.4 16.2H2.6L12 3.6z" />
      <path d="M12 10v4.4M12 17.4v.1" />
    </svg>
  )
}

// Compact inline notice: small icon + ONE friendly sentence on a soft tint.
// 'warning' (amber) is for help / try-again; 'error' (red tint) only for a
// real blocking failure like a wrong password; 'success' is green. The
// owner clears it when the player edits a field or retries (see
// GameAuthGate's CLEAR_BANNER).
export function AuthNotice({ kind = 'warning', children }) {
  return (
    <div
      className={`game-auth-notice game-auth-notice--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span className="game-auth-notice-icon">
        <NoticeIcon kind={kind} />
      </span>
      <p className="game-auth-notice-text">{children}</p>
    </div>
  )
}

// The gate's current banner ({kind, message}) as a notice, or nothing.
export function AuthBanner({ banner }) {
  if (!banner) return null
  return <AuthNotice kind={banner.kind}>{banner.message}</AuthNotice>
}

// Label on top, the control, then (only when there is one) a short error
// under it. `children` is the control itself so the same wrapper serves
// text inputs, selects and the date picker.
export function AuthField({
  id,
  label,
  error,
  hint,
  children,
  className = '',
}) {
  return (
    <div className={`game-auth-field${error ? ' has-error' : ''} ${className}`}>
      {label && (
        <label className="game-auth-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-msg`} className="game-auth-field-error" role="alert">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 7.2v5.6M12 16.4v.1" />
          </svg>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="game-auth-hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function AuthPasswordInput({ id, error, className = '', ...rest }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="game-auth-password">
      <input
        id={id}
        className={`game-auth-input ${className}`}
        type={visible ? 'text' : 'password'}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-msg` : undefined}
        {...rest}
      />
      <button
        type="button"
        className="game-auth-eye"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}

// "Step n of N" dots for the forgot / reset flow.
export function AuthSteps({ current, labels }) {
  return (
    <ol className="game-auth-steps" aria-label="Progress">
      {labels.map((label, i) => (
        <li
          key={label}
          className={
            i + 1 < current ? 'done' : i + 1 === current ? 'current' : ''
          }
          aria-current={i + 1 === current ? 'step' : undefined}
        >
          <span className="game-auth-step-dot" aria-hidden="true">
            {i + 1 < current ? '✓' : i + 1}
          </span>
          <span className="game-auth-step-label">{label}</span>
        </li>
      ))}
    </ol>
  )
}
