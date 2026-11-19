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
import GameLegalModal from '../game-legal/GameLegalModal'
import { recordGameTermsAcceptance } from '../../utils/gameTermsAcceptance'
import GameButton from '../../game/ui/GameButton'
import { AuthBanner, AuthField } from './AuthParts'
import { FIELD_MESSAGES } from '../../utils/authErrors'

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
const MIN_BIRTH_DATE = '1900-01-01'
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// "2000-11-15" -> "15 Nov 2000" (parsed by hand: no timezone shifts).
function formatBirthDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

function todayIso() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

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
  if (!form.country) errors.country = FIELD_MESSAGES.countryRequired
  if (!form.birthDate) errors.birthDate = FIELD_MESSAGES.birthDateRequired
  else if (!isOldEnough(form.birthDate))
    errors.birthDate = `You need to be at least ${MIN_AGE_YEARS} to join.`
  return errors
}

export default function GameSignUpScreen({
  onSubmit,
  onBack,
  onEdit,
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
  const [legalDoc, setLegalDoc] = useState(null) // 'terms' | 'privacy' | null
  const firstFieldRef = useRef(null)
  const errors = validate(form)

  useEffect(() => {
    if (!sentEmail) firstFieldRef.current?.focus()
  }, [sentEmail])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    onEdit?.()
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
    recordGameTermsAcceptance(form.email.trim())
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
    'aria-describedby':
      touched[name] && errors[name] ? `ga-${name}-msg` : undefined,
  })
  // Inline validation message next to a field - only once it's been touched.
  const err = (name) => (touched[name] && errors[name]) || null

  if (sentEmail) {
    return (
      <div className="game-auth-card">
        <div className="game-auth-sent-icon" aria-hidden="true">
          📬
        </div>
        <div className="game-auth-header">
          <h1 className="game-auth-title">You&apos;re in!</h1>
          <p className="game-auth-subtitle">
            We&apos;ve sent your login details to <strong>{sentEmail}</strong>.
            Open the email and tap the link to set your own password.
          </p>
        </div>
        <div className="game-auth-actions">
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width"
            onClick={onHavePassword}
          >
            I have my password
          </GameButton>
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
          <GameButton
            variant="secondary"
            size="lg"
            className="g-full-width"
            onClick={onBack}
          >
            Back
          </GameButton>
        </div>
      </div>
    )
  }

  return (
    <div className="game-auth-card game-auth-signup">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ‹ Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Join Run Conquest</h1>
        <p className="game-auth-subtitle">
          Your password is emailed to you right after.
        </p>
      </div>

      <AuthBanner banner={banner} />

      <form className="game-auth-form" onSubmit={handleSubmit} noValidate>
        <div className="game-auth-grid">
          <AuthField id="ga-fullName" label="Full Name" error={err('fullName')}>
            <input
              {...fieldProps('fullName')}
              ref={firstFieldRef}
              className="game-auth-input"
              type="text"
              autoComplete="name"
            />
          </AuthField>
          <AuthField id="ga-email" label="Email" error={err('email')}>
            <input
              {...fieldProps('email')}
              className="game-auth-input"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </AuthField>
          <AuthField
            id="ga-mobileNumber"
            label="Mobile Number"
            error={err('mobileNumber')}
          >
            <input
              {...fieldProps('mobileNumber')}
              className="game-auth-input"
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              autoComplete="tel"
            />
          </AuthField>
          <div className="game-auth-pair">
            <AuthField id="ga-country" label="Country" error={err('country')}>
              <select {...fieldProps('country')} className="game-auth-select">
                <option value="">Select</option>
                {COUNTRIES_SORTED.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </AuthField>
            <AuthField
              id="ga-birthDate"
              label="Date of Birth"
              error={err('birthDate')}
            >
              {/* Native date picker kept (tap opens it); the input itself is
                  see-through and the formatted value / "Select date" text is
                  drawn under it, so iOS/WebView's own date look and
                  intrinsic size never show. */}
              <div className="game-auth-date">
                <input
                  {...fieldProps('birthDate')}
                  className="game-auth-input game-auth-date-input"
                  type="date"
                  min={MIN_BIRTH_DATE}
                  max={todayIso()}
                  autoComplete="bday"
                />
                <span
                  className={`game-auth-date-text${form.birthDate ? ' has-value' : ''}`}
                  aria-hidden="true"
                >
                  {formatBirthDate(form.birthDate) || 'Select date'}
                </span>
              </div>
            </AuthField>
          </div>
        </div>

        <label
          className="game-auth-terms"
          htmlFor="game-signup-terms-agreement"
        >
          <input
            id="game-signup-terms-agreement"
            className="game-auth-checkbox"
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => {
              setAgreedToTerms(e.target.checked)
              onEdit?.()
            }}
          />
          <span>
            I am old enough to play and agree to the{' '}
            <button
              type="button"
              className="game-auth-terms-link"
              onClick={(e) => {
                e.preventDefault()
                setLegalDoc('terms')
              }}
            >
              Terms
            </button>{' '}
            and{' '}
            <button
              type="button"
              className="game-auth-terms-link"
              onClick={(e) => {
                e.preventDefault()
                setLegalDoc('privacy')
              }}
            >
              Privacy Policy
            </button>
            .
          </span>
        </label>

        <div className="game-auth-actions">
          <GameButton
            type="submit"
            variant="success"
            size="lg"
            className="g-full-width"
            loading={submitting}
            disabled={!agreedToTerms}
          >
            Create Account
          </GameButton>
          <button
            type="button"
            className="game-auth-link"
            onClick={onHavePassword}
          >
            Already got your login email? Set your password
          </button>
        </div>
      </form>
      {legalDoc && (
        <GameLegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
      )}
    </div>
  )
}
