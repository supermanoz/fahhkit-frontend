/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'

export default function GameForgotPasswordScreen({
  onSubmit,
  onBack,
  submitting,
  banner,
  sent,
  onHavePassword,
}) {
  const [mobileNumber, setMobileNumber] = useState('')
  const firstFieldRef = useRef(null)

  useEffect(() => {
    if (!sent) firstFieldRef.current?.focus()
  }, [sent])

  function handleSubmit(e) {
    e.preventDefault()
    if (!e.target.reportValidity()) return
    onSubmit(mobileNumber)
  }

  if (sent) {
    return (
      <div className="game-auth-card">
        <div className="game-auth-sent-icon" aria-hidden="true">
          📧
        </div>
        <div className="game-auth-header">
          <h1 className="game-auth-title">Check your inbox!</h1>
          <p className="game-auth-subtitle">
            We&apos;ve emailed you a new password — open it and sign in below.
          </p>
        </div>
        <div className="game-auth-actions">
          <button
            type="button"
            className="game-auth-submit"
            onClick={onHavePassword}
          >
            I have my new password
          </button>
          <button
            type="button"
            className="game-auth-secondary"
            onClick={onBack}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Forgot Password</h1>
        <p className="game-auth-subtitle">
          Enter your mobile number or email to receive a new password
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
          <label className="game-auth-label" htmlFor="ga-forgot-mobile">
            Mobile Number or Email
          </label>
          <input
            ref={firstFieldRef}
            id="ga-forgot-mobile"
            className="game-auth-input"
            type="text"
            autoComplete="username"
            placeholder="98XXXXXXXX or you@example.com"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            required
          />
        </div>

        <div className="game-auth-actions">
          <button
            type="submit"
            className="game-auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send New Password'}
          </button>
        </div>
      </form>
    </div>
  )
}
