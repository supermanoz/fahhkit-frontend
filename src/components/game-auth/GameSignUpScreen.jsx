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

// Same 15 fields, same patterns, same endpoint (via useAuthFlow.signUpAthlete)
// as the website's RegisterPage - this is the exact-parity signup the
// backend's POST /v1/athlete/signup actually expects (no password field; one
// is emailed - see GameAuthGate.jsx/useAuthFlow.js for why).
const INITIAL_FORM = {
  fullName: '',
  email: '',
  mobileNumber: '',
  gender: '',
  birthDate: '',
  address: '',
  country: '',
  city: '',
  nationality: '',
  occupation: '',
  bloodGroup: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactPhone: '',
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
  const [confirmEmail, setConfirmEmail] = useState('')
  const firstFieldRef = useRef(null)
  const emailsMismatch =
    confirmEmail.trim() !== '' &&
    confirmEmail.trim().toLowerCase() !== form.email.trim().toLowerCase()

  useEffect(() => {
    if (!sentEmail) firstFieldRef.current?.focus()
  }, [sentEmail])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const confirmInput = e.target.elements.confirmEmail
    confirmInput.setCustomValidity(
      emailsMismatch ? "Emails don't match — check for typos." : ''
    )
    if (!e.target.reportValidity()) return
    onSubmit(form)
  }

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
    <div className="game-auth-card">
      <button type="button" className="game-auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="game-auth-header">
        <h1 className="game-auth-title">Join FahhKit</h1>
        <p className="game-auth-subtitle">Create your athlete profile</p>
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
          <div className="game-auth-field full">
            <label className="game-auth-label" htmlFor="ga-fullName">
              Full Name
            </label>
            <input
              ref={firstFieldRef}
              id="ga-fullName"
              name="fullName"
              className="game-auth-input"
              type="text"
              autoComplete="name"
              pattern={NAME_PATTERN}
              title={NAME_TITLE}
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-email">
              Email
            </label>
            <input
              id="ga-email"
              name="email"
              className="game-auth-input"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              pattern={EMAIL_PATTERN}
              title={EMAIL_TITLE}
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-confirmEmail">
              Confirm Email
            </label>
            <input
              id="ga-confirmEmail"
              name="confirmEmail"
              className="game-auth-input"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => {
                e.target.setCustomValidity('')
                setConfirmEmail(e.target.value)
              }}
              aria-invalid={emailsMismatch || undefined}
              aria-describedby="ga-confirmEmail-hint"
              required
            />
            <p
              id="ga-confirmEmail-hint"
              className={`game-auth-hint${emailsMismatch ? ' error' : ''}`}
              aria-live="polite"
            >
              {emailsMismatch
                ? "Emails don't match yet."
                : 'Your login details are sent here.'}
            </p>
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-mobileNumber">
              Mobile Number
            </label>
            <input
              id="ga-mobileNumber"
              name="mobileNumber"
              className="game-auth-input"
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              autoComplete="tel"
              pattern={PHONE_PATTERN}
              title={PHONE_TITLE}
              value={form.mobileNumber}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-gender">
              Gender
            </label>
            <select
              id="ga-gender"
              name="gender"
              className="game-auth-select"
              value={form.gender}
              onChange={handleChange}
              required
            >
              <option value="">Select gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHERS">Others</option>
            </select>
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-birthDate">
              Date of Birth
            </label>
            <input
              id="ga-birthDate"
              name="birthDate"
              className="game-auth-input"
              type="date"
              autoComplete="bday"
              value={form.birthDate}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field full">
            <label className="game-auth-label" htmlFor="ga-address">
              Address
            </label>
            <input
              id="ga-address"
              name="address"
              className="game-auth-input"
              type="text"
              autoComplete="street-address"
              value={form.address}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-country">
              Country
            </label>
            <select
              id="ga-country"
              name="country"
              className="game-auth-select"
              value={form.country}
              onChange={handleChange}
              required
            >
              <option value="">Select country</option>
              {COUNTRIES_SORTED.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-city">
              City
            </label>
            <input
              id="ga-city"
              name="city"
              className="game-auth-input"
              type="text"
              autoComplete="address-level2"
              value={form.city}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-nationality">
              Nationality
            </label>
            <input
              id="ga-nationality"
              name="nationality"
              className="game-auth-input"
              type="text"
              value={form.nationality}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label className="game-auth-label" htmlFor="ga-occupation">
              Occupation <span>(optional)</span>
            </label>
            <input
              id="ga-occupation"
              name="occupation"
              className="game-auth-input"
              type="text"
              value={form.occupation}
              onChange={handleChange}
            />
          </div>
          <div className="game-auth-field full">
            <label className="game-auth-label" htmlFor="ga-bloodGroup">
              Blood Group <span>(optional)</span>
            </label>
            <input
              id="ga-bloodGroup"
              name="bloodGroup"
              className="game-auth-input"
              type="text"
              placeholder="e.g. O+"
              value={form.bloodGroup}
              onChange={handleChange}
            />
          </div>
          <div className="game-auth-field full">
            <label
              className="game-auth-label"
              htmlFor="ga-emergencyContactName"
            >
              Emergency Contact Name
            </label>
            <input
              id="ga-emergencyContactName"
              name="emergencyContactName"
              className="game-auth-input"
              type="text"
              pattern={NAME_PATTERN}
              title={NAME_TITLE}
              value={form.emergencyContactName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="game-auth-field">
            <label
              className="game-auth-label"
              htmlFor="ga-emergencyContactRelationship"
            >
              Relationship
            </label>
            <select
              id="ga-emergencyContactRelationship"
              name="emergencyContactRelationship"
              className="game-auth-select"
              value={form.emergencyContactRelationship}
              onChange={handleChange}
              required
            >
              <option value="">Select relationship</option>
              <option value="Family">Family</option>
              <option value="Partner">Partner</option>
              <option value="Relative">Relative</option>
              <option value="Friend">Friend</option>
              <option value="Colleague">Colleague</option>
              <option value="Classmate">Classmate</option>
              <option value="Neighbor">Neighbor</option>
              <option value="Guardian">Guardian</option>
              <option value="Caregiver">Caregiver</option>
              <option value="Professional">Professional</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="game-auth-field">
            <label
              className="game-auth-label"
              htmlFor="ga-emergencyContactPhone"
            >
              Contact Phone
            </label>
            <input
              id="ga-emergencyContactPhone"
              name="emergencyContactPhone"
              className="game-auth-input"
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              pattern={PHONE_PATTERN}
              title={PHONE_TITLE}
              value={form.emergencyContactPhone}
              onChange={handleChange}
              required
            />
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
            {submitting ? 'Registering…' : 'Register'}
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
