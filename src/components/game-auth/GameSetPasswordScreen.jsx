/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import GameButton from '../../game/ui/GameButton'
import {
  AuthBanner,
  AuthField,
  AuthPasswordInput,
  AuthSteps,
} from './AuthParts'
import { RESET_STEPS } from './resetSteps'
import { FIELD_MESSAGES } from '../../utils/authErrors'

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
  onEdit,
  onSignIn,
  submitting,
  banner,
  passwordUpdated,
  initialMobileNumber,
}) {
  const [mobileNumber, setMobileNumber] = useState(initialMobileNumber || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [errors, setErrors] = useState({})
  const firstFieldRef = useRef(null)

  useEffect(() => {
    if (!passwordUpdated) firstFieldRef.current?.focus()
  }, [passwordUpdated])

  function edit(field, setter) {
    return (e) => {
      setter(e.target.value)
      setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev))
      onEdit?.()
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!mobileNumber.trim()) next.mobile = FIELD_MESSAGES.identifierRequired
    if (!oldPassword) next.old = FIELD_MESSAGES.emailedPasswordRequired
    if (!newPassword) next.new = FIELD_MESSAGES.newPasswordRequired
    if (!confirmNewPassword) next.confirm = FIELD_MESSAGES.confirmRequired
    else if (newPassword !== confirmNewPassword)
      next.confirm = FIELD_MESSAGES.confirmMismatch
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({
      mobileNumber: mobileNumber.trim(),
      oldPassword,
      newPassword,
    })
  }

  // Final step - success, with the way back in.
  if (passwordUpdated) {
    return (
      <div className="game-auth-card">
        <AuthSteps current={4} labels={RESET_STEPS} />
        <div className="game-auth-sent-icon" aria-hidden="true">
          ✅
        </div>
        <div className="game-auth-header">
          <h1 className="game-auth-title">Password updated!</h1>
          <p className="game-auth-subtitle">
            You&apos;re all set. Sign in with your new password to get back to
            running.
          </p>
        </div>
        <div className="game-auth-actions">
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width"
            onClick={onSignIn}
          >
            Sign In
          </GameButton>
        </div>
      </div>
    )
  }

  return (
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ‹ Back
      </button>
      <AuthSteps current={3} labels={RESET_STEPS} />
      <div className="game-auth-header">
        <h1 className="game-auth-title">Set Your Password</h1>
        <p className="game-auth-subtitle">
          Enter the password we emailed you, then choose a new one.
        </p>
      </div>

      <AuthBanner banner={banner} />

      <form className="game-auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="ga-sp-mobile"
          label="Mobile Number or Email"
          error={errors.mobile}
        >
          <input
            ref={firstFieldRef}
            id="ga-sp-mobile"
            className="game-auth-input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={mobileNumber}
            onChange={edit('mobile', setMobileNumber)}
            aria-invalid={errors.mobile ? true : undefined}
            aria-describedby={errors.mobile ? 'ga-sp-mobile-msg' : undefined}
          />
        </AuthField>
        <AuthField id="ga-sp-old" label="Emailed Password" error={errors.old}>
          <AuthPasswordInput
            id="ga-sp-old"
            name="oldPassword"
            autoComplete="current-password"
            value={oldPassword}
            onChange={edit('old', setOldPassword)}
            error={errors.old}
          />
        </AuthField>
        <AuthField id="ga-sp-new" label="New Password" error={errors.new}>
          <AuthPasswordInput
            id="ga-sp-new"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={edit('new', setNewPassword)}
            error={errors.new}
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
        </AuthField>
        <AuthField
          id="ga-sp-confirm"
          label="Confirm New Password"
          error={errors.confirm}
        >
          <AuthPasswordInput
            id="ga-sp-confirm"
            name="confirmNewPassword"
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={edit('confirm', setConfirmNewPassword)}
            error={errors.confirm}
          />
        </AuthField>

        <div className="game-auth-actions">
          <GameButton
            type="submit"
            variant="success"
            size="lg"
            className="g-full-width"
            loading={submitting}
          >
            Save New Password
          </GameButton>
        </div>
      </form>
    </div>
  )
}
