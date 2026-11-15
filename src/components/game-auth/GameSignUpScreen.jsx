/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { COUNTRIES_SORTED } from '../../constants/countries'
import {
  EMAIL_PATTERN,
  EMAIL_TITLE,
  NAME_PATTERN,
  NAME_TITLE,
  PHONE_PATTERN,
  PHONE_TITLE,
} from '../../constants/validation'
import TermsAgreement from '../TermsAgreement'

// POST /v1/athlete/signup (via useAuthFlow.signUpAthlete) has NO password
// or username field - the server generates a password and emails it (see
// GameAuthGate.jsx/useAuthFlow.js). What its @Valid AthleteSignupRequest
// actually requires: fullName, email, mobileNumber (9XXXXXXXXX, unique, also
// the login id), country, birthDate (age >= 10), gender and address. We ask
// only for the ones that can't be faked honestly; gender and address are
// sent as accepted placeholders (SIGNUP_DEFAULTS) and everything optional
// (city, nationality, blood group, occupation, emergency contact, ID photos)
// is simply not sent.
const SIGNUP_DEFAULTS = { gender: 'OTHERS', address: 'Not provided' }
const MIN_AGE_YEARS = 10

const INITIAL_FORM = {
  fullName: '',
  email: '',
  mobileNumber: '',
  country: '',
  birthDate: '',
}

const NAME_RE = new RegExp(NAME_PATTERN)
const EMAIL_RE = new RegExp(EMAIL_PATTERN)
const PHONE_RE = new RegExp(PHONE_PATTERN)

function isOldEnough(isoDate) {
  const born = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(born.getTime())) return false
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE_YEARS)
  return born <= cutoff
}

// Same rules the backend enforces, as inline messages.
function validate(form) {
  const errors = {}
  if (!NAME_RE.test(form.fullName.trim())) errors.fullName = NAME_TITLE
  if (!EMAIL_RE.test(form.email.trim())) errors.email = EMAIL_TITLE
  if (!PHONE_RE.test(form.mobileNumber.trim()))
    errors.mobileNumber = PHONE_TITLE
  if (!form.country) errors.country = 'Pick your country.'
  if (!form.birthDate) errors.birthDate = 'Enter your date of birth.'
  else if (!isOldEnough(form.birthDate))
    errors.birthDate = `You need to be at least ${MIN_AGE_YEARS} to join.`
  return errors
}

export default function GameSignUpScreen({
  onSubmit,
  onBack,
  submitting,
  banner,
  sentEmail,
  onResend,
  resendCooldownSeconds,
  onHavePassword,
}) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [touched, setTouched] = useState({})
  const firstFieldRef = useRef(null)
  const errors = validate(form)

  useEffect(() => {
    if (!sentEmail) firstFieldRef.current?.focus()
  }, [sentEmail])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }
  function handleBlur(e) {
    const { name } = e.target
    setTouched((prev) => ({ ...prev, [name]: true }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (Object.keys(errors).length > 0) {
      setTouched({
        fullName: true,
        email: true,
        mobileNumber: true,
        country: true,
        birthDate: true,
      })
      return
    }
    onSubmit({
      ...SIGNUP_DEFAULTS,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      mobileNumber: form.mobileNumber.trim(),
      country: form.country,
      birthDate: form.birthDate,
    })
  }

  const fieldProps = (name) => ({
    id: `ga-${name}`,
    name,
    value: form[name],
    onChange: handleChange,
    onBlur: handleBlur,
    'aria-invalid': (touched[name] && errors[name]) || undefined,
    'aria-describedby': `ga-${name}-msg`,
  })
  const msg = (name) => (
    <p
      id={`ga-${name}-msg`}
      className={`game-auth-hint${touched[name] && errors[name] ? ' error' : ''}`}
      aria-live="polite"
    >
      {touched[name] && errors[name] ? errors[name] : '\u00a0'}
    </p>
  )

  if (sentEmail) {
    return (
      <div className="game-auth-card">
        <div className="game-auth-sent-icon" aria-hidden="true">
          📬
        </div>
        <div className="game-auth-header">
          <h1 className="game-auth-title">You&apos;re in!</h1>
          <p className="game-auth-subtitle">
            We&apos;ve sent your login details to <strong>{sentEmail}</strong> —
            open the email and tap the link to set your own password.
          </p>
        </div>
        <div className="game-auth-actions">
          <button
            type="button"
            className="game-auth-submit"
            onClick={onHavePassword}
          >
            I have my password
          </button>
          <button
            type="button"
            className="game-auth-link"
            onClick={onResend}
            disabled={resendCooldownSeconds > 0}
          >
            {resendCooldownSeconds > 0
              ? `Resend available in ${resendCooldownSeconds}s`
              : "Didn't get it? Send again"}
          </button>
          <button
            type="button"
            className="game-auth-secondary"
            onClick={onBack}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="game-auth-card game-auth-signup">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Join FahhKit</h1>
        <p className="game-auth-subtitle">
          Your password is emailed to you right after.
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
        <div className="game-auth-grid">
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-fullName">
              Full Name
            </label>
            <input
              {...fieldProps('fullName')}
              ref={firstFieldRef}
              className="game-auth-input"
              type="text"
              autoComplete="name"
            />
            {msg('fullName')}
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-email">
              Email
            </label>
            <input
              {...fieldProps('email')}
              className="game-auth-input"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
            {msg('email')}
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-mobileNumber">
              Mobile Number
            </label>
            <input
              {...fieldProps('mobileNumber')}
              className="game-auth-input"
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              autoComplete="tel"
            />
            {msg('mobileNumber')}
          </div>
          <div className="game-auth-pair">
            <div className="game-auth-field">
              <label className="game-auth-label" htmlFor="ga-country">
                Country
              </label>
              <select {...fieldProps('country')} className="game-auth-select">
                <option value="">Select</option>
                {COUNTRIES_SORTED.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              {msg('country')}
            </div>
            <div className="game-auth-field">
              <label className="game-auth-label" htmlFor="ga-birthDate">
                Date of Birth
              </label>
              <input
                {...fieldProps('birthDate')}
                className="game-auth-input"
                type="date"
                autoComplete="bday"
              />
              {msg('birthDate')}
            </div>
          </div>
        </div>

        <TermsAgreement
          id="game-signup-terms-agreement"
          to="/terms/signup"
          checked={agreedToTerms}
          onChange={setAgreedToTerms}
        />

        <div className="game-auth-actions">
          <button
            type="submit"
            className="game-auth-submit"
            disabled={submitting || !agreedToTerms}
          >
            {submitting ? 'Creating…' : 'Create Account'}
          </button>
          <button
            type="button"
            className="game-auth-link"
            onClick={onHavePassword}
          >
            Already got your login email? Set your password
          </button>
        </div>
      </form>
    </div>
  )
}
