/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import GameButton from '../../game/ui/GameButton'
import {
  AuthBanner,
  AuthField,
  AuthNotice,
  AuthPasswordInput,
} from './AuthParts'
import { FIELD_MESSAGES, MESSAGES } from '../../utils/authErrors'

export default function GameSignInScreen({
  onSubmit,
  onForgot,
  onBack,
  onEdit,
  submitting,
  banner,
  cooldownSeconds,
  initialMobileNumber,
}) {
  const [mobileNumber, setMobileNumber] = useState(initialMobileNumber || '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const firstFieldRef = useRef(null)

  // Focus the first field on entering this screen - part of the spec's
  // "focus management between screens" requirement (GameAuthGate swaps
  // screens outright rather than routing, so there's no router-driven focus
  // reset to rely on).
  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  const onCooldown = cooldownSeconds > 0

  function edit(field, setter) {
    return (e) => {
      setter(e.target.value)
      setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev))
      onEdit?.()
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (onCooldown) return
    const next = {}
    if (!mobileNumber.trim()) next.mobile = FIELD_MESSAGES.identifierRequired
    if (!password) next.password = FIELD_MESSAGES.passwordRequired
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit(mobileNumber.trim(), password)
  }

  return (
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ‹ Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Welcome Back</h1>
        <p className="game-auth-subtitle">Sign in to keep your streak alive.</p>
      </div>

      <AuthBanner banner={banner} />
      {onCooldown && (
        <AuthNotice kind="warning">
          {MESSAGES.cooldown(cooldownSeconds)}
        </AuthNotice>
      )}

      <form className="game-auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="game-auth-mobile"
          label="Mobile Number or Email"
          error={errors.mobile}
        >
          <input
            ref={firstFieldRef}
            id="game-auth-mobile"
            className="game-auth-input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="98XXXXXXXX or you@example.com"
            value={mobileNumber}
            onChange={edit('mobile', setMobileNumber)}
            aria-invalid={errors.mobile ? true : undefined}
            aria-describedby={
              errors.mobile ? 'game-auth-mobile-msg' : undefined
            }
          />
        </AuthField>
        <AuthField
          id="game-auth-password"
          label="Password"
          error={errors.password}
        >
          <AuthPasswordInput
            id="game-auth-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={edit('password', setPassword)}
            error={errors.password}
          />
        </AuthField>

        <button type="button" className="game-auth-link" onClick={onForgot}>
          Forgot password?
        </button>

        <div className="game-auth-actions">
          <GameButton
            type="submit"
            variant="success"
            size="lg"
            className="g-full-width"
            loading={submitting}
            disabled={onCooldown}
          >
            Sign In
          </GameButton>
        </div>
      </form>
    </div>
  )
}
