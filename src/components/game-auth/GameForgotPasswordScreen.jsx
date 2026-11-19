/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import GameButton from '../../game/ui/GameButton'
import { AuthBanner, AuthField, AuthSteps } from './AuthParts'
import { RESET_STEPS } from './resetSteps'
import { FIELD_MESSAGES } from '../../utils/authErrors'

export default function GameForgotPasswordScreen({
  onSubmit,
  onBack,
  onEdit,
  submitting,
  banner,
  sent,
  onHavePassword,
}) {
  const [mobileNumber, setMobileNumber] = useState('')
  const [error, setError] = useState(null)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    if (!sent) firstFieldRef.current?.focus()
  }, [sent])

  function handleSubmit(e) {
    e.preventDefault()
    if (!mobileNumber.trim()) {
      setError(FIELD_MESSAGES.identifierRequired)
      return
    }
    onSubmit(mobileNumber.trim())
  }

  // Step 2 - "Check your inbox".
  if (sent) {
    return (
      <div className="game-auth-card">
        <AuthSteps current={2} labels={RESET_STEPS} />
        <div className="game-auth-sent-icon" aria-hidden="true">
          📧
        </div>
        <div className="game-auth-header">
          <h1 className="game-auth-title">Check your inbox!</h1>
          <p className="game-auth-subtitle">
            We&apos;ve emailed you a new password. Open the email, then come
            back here to choose your own.
          </p>
        </div>
        <div className="game-auth-actions">
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width"
            onClick={onHavePassword}
          >
            I have my new password
          </GameButton>
          <GameButton
            variant="secondary"
            size="lg"
            className="g-full-width"
            onClick={onBack}
          >
            Back to Sign In
          </GameButton>
        </div>
      </div>
    )
  }

  // Step 1 - ask for the account.
  return (
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ‹ Back
      </button>
      <AuthSteps current={1} labels={RESET_STEPS} />
      <div className="game-auth-header">
        <h1 className="game-auth-title">Forgot Password</h1>
        <p className="game-auth-subtitle">
          Enter your mobile number or email and we&apos;ll send you a new
          password.
        </p>
      </div>

      <AuthBanner banner={banner} />

      <form className="game-auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="ga-forgot-mobile"
          label="Mobile Number or Email"
          error={error}
        >
          <input
            ref={firstFieldRef}
            id="ga-forgot-mobile"
            className="game-auth-input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="98XXXXXXXX or you@example.com"
            value={mobileNumber}
            onChange={(e) => {
              setMobileNumber(e.target.value)
              setError(null)
              onEdit?.()
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'ga-forgot-mobile-msg' : undefined}
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
            Send New Password
          </GameButton>
        </div>
      </form>
    </div>
  )
}
