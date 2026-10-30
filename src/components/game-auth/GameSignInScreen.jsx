/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import PasswordField from '../PasswordField'

export default function GameSignInScreen({
  onSubmit,
  onForgot,
  onBack,
  submitting,
  banner,
  cooldownSeconds,
  initialMobileNumber,
}) {
  const [mobileNumber, setMobileNumber] = useState(initialMobileNumber || '')
  const [password, setPassword] = useState('')
  const firstFieldRef = useRef(null)

  // Focus the first field on entering this screen - part of the spec's
  // "focus management between screens" requirement (GameAuthGate swaps
  // screens outright rather than routing, so there's no router-driven focus
  // reset to rely on).
  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  const onCooldown = cooldownSeconds > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!e.target.reportValidity() || onCooldown) return
    onSubmit(mobileNumber, password)
  }

  return (
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Welcome Back</h1>
        <p className="game-auth-subtitle">Sign in to keep your streak alive</p>
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
      {onCooldown && (
        <p className="game-auth-banner error" role="status" aria-live="polite">
          Too many attempts — try again in {cooldownSeconds}s.
        </p>
      )}

      <form className="game-auth-form" onSubmit={handleSubmit} noValidate>
        <div className="game-auth-field">
          <label className="game-auth-label" htmlFor="game-auth-mobile">
            Mobile Number or Email
          </label>
          <input
            ref={firstFieldRef}
            id="game-auth-mobile"
            className="game-auth-input"
            type="text"
            autoComplete="username"
            placeholder="98XXXXXXXX or you@example.com"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            required
          />
        </div>
        <div className="game-auth-field">
          <label className="game-auth-label" htmlFor="game-auth-password">
            Password
          </label>
          <PasswordField
            id="game-auth-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="button" className="game-auth-link" onClick={onForgot}>
          Forgot password?
        </button>

        <div className="game-auth-actions">
          <button
            type="submit"
            className="game-auth-submit"
            disabled={submitting || onCooldown}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  )
}
