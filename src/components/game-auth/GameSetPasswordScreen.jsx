/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import PasswordField from '../PasswordField'

// There's no password-strength rule anywhere on the backend today
// (PasswordChangeRequest.java has zero validation annotations) - this
// checklist is a sensible baseline, shown live, but kept purely informational
// (never blocks submit) so it can never reject a password the backend would
// otherwise accept. See useAuthFlow.js's completePasswordSetup for the
// authenticate-then-change-password dance this screen drives.
const REQUIREMENTS = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (pw) => pw.length >= 8,
  },
  {
    id: 'letter',
    label: 'At least one letter',
    test: (pw) => /[a-zA-Z]/.test(pw),
  },
  { id: 'number', label: 'At least one number', test: (pw) => /\d/.test(pw) },
]

export default function GameSetPasswordScreen({
  onSubmit,
  onBack,
  submitting,
  banner,
  initialMobileNumber,
}) {
  const [mobileNumber, setMobileNumber] = useState(initialMobileNumber || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const firstFieldRef = useRef(null)
  const mismatch =
    confirmNewPassword !== '' && newPassword !== confirmNewPassword

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const confirmInput = e.target.elements.confirmNewPassword
    confirmInput.setCustomValidity(mismatch ? 'Passwords do not match.' : '')
    if (!e.target.reportValidity()) return
    onSubmit({ mobileNumber, oldPassword, newPassword })
  }

  return (
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Set Your Password</h1>
        <p className="game-auth-subtitle">
          Enter the password we emailed you, then choose a new one
        </p>
      </div>

      {banner && (
        <p
          className={`game-auth-banner ${banner.kind}`}
          role="status"
          aria-live="polite"
        >
          {banner.message}
        </p>
      )}

      <form className="game-auth-form" onSubmit={handleSubmit} noValidate>
        <div className="game-auth-field">
          <label className="game-auth-label" htmlFor="ga-sp-mobile">
            Mobile Number or Email
          </label>
          <input
            ref={firstFieldRef}
            id="ga-sp-mobile"
            className="game-auth-input"
            type="text"
            autoComplete="username"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            required
          />
        </div>
        <div className="game-auth-field">
          <label className="game-auth-label" htmlFor="ga-sp-old">
            Emailed Password
          </label>
          <PasswordField
            id="ga-sp-old"
            name="oldPassword"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
        </div>
        <div className="game-auth-field">
          <label className="game-auth-label" htmlFor="ga-sp-new">
            New Password
          </label>
          <PasswordField
            id="ga-sp-new"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <ul className="game-auth-strength">
            {REQUIREMENTS.map((req) => {
              const met = req.test(newPassword)
              return (
                <li key={req.id} className={met ? 'met' : ''}>
                  <span className="game-auth-strength-dot" aria-hidden="true" />
                  {req.label}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="game-auth-field">
          <label className="game-auth-label" htmlFor="ga-sp-confirm">
            Confirm New Password
          </label>
          <PasswordField
            id="ga-sp-confirm"
            name="confirmNewPassword"
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(e) => {
              e.target.setCustomValidity('')
              setConfirmNewPassword(e.target.value)
            }}
            aria-invalid={mismatch || undefined}
            required
          />
          {mismatch && (
            <p className="game-auth-hint error" aria-live="polite">
              Passwords do not match.
            </p>
          )}
        </div>

        <div className="game-auth-actions">
          <button
            type="submit"
            className="game-auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  )
}
