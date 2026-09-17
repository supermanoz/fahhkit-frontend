import { useState } from 'react'
import { Link } from 'react-router-dom'
import { postForm, ApiError } from '../api/client'
import { COUNTRIES_SORTED } from '../constants/countries'
import {
  NAME_PATTERN,
  NAME_TITLE,
  PHONE_PATTERN,
  PHONE_TITLE,
} from '../constants/validation'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import TermsAgreement from '../components/TermsAgreement'
import './RegisterPage.css'

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

export default function RegisterPage() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState(null) // { kind: "success" | "error", message }
  // Set once signup succeeds - the athlete's password arrives by email (with
  // a link straight into UpdatePasswordPage), never shown here, so this page
  // just confirms the email was sent instead of routing to that form itself.
  const [registeredEmail, setRegisteredEmail] = useState(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBanner(null)

    if (!e.target.reportValidity()) return

    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (value.trim() !== '') formData.append(key, value)
    })

    setSubmitting(true)
    try {
      const data = await postForm('/v1/athlete/signup', formData)
      setRegisteredEmail(data?.email || form.email)
      setForm(INITIAL_FORM)
      setAgreedToTerms(false)
      e.target.reset()
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Registration failed. Please try again.'
      setBanner({ kind: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="register-page">
      <Navbar />
      <div className="register-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="register-inner">
          {registeredEmail ? (
            <div className="glass-card register-success" data-aos="fade-up">
              <div className="register-success-icon" aria-hidden="true">
                📬
              </div>
              <h1>You&apos;re in!</h1>
              <p>
                We&apos;ve sent your login details to{' '}
                <strong>{registeredEmail}</strong> — open the email and tap the
                link to set your own password.
              </p>
              <Link to="/login" className="btn btn-primary">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <header className="register-header" data-aos="fade-down">
                <h1>Join FahhKit</h1>
                <p>Fill out the form below to register as an athlete</p>
              </header>

              {banner && (
                <div className={`banner ${banner.kind}`}>{banner.message}</div>
              )}

              <form
                className="glass-card"
                onSubmit={handleSubmit}
                noValidate
                data-aos="fade-up"
              >
                <fieldset>
                  <legend>Personal Details</legend>
                  <div className="grid">
                    <div className="field full">
                      <label htmlFor="fullName">Full Name</label>
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        pattern={NAME_PATTERN}
                        title={NAME_TITLE}
                        value={form.fullName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="email">Email</label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="mobileNumber">Mobile Number</label>
                      <input
                        id="mobileNumber"
                        name="mobileNumber"
                        type="tel"
                        inputMode="numeric"
                        placeholder="98XXXXXXXX"
                        pattern={PHONE_PATTERN}
                        title={PHONE_TITLE}
                        value={form.mobileNumber}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="gender">Gender</label>
                      <select
                        id="gender"
                        name="gender"
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
                    <div className="field">
                      <label htmlFor="birthDate">Date of Birth</label>
                      <input
                        id="birthDate"
                        name="birthDate"
                        type="date"
                        value={form.birthDate}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="address">Address</label>
                      <input
                        id="address"
                        name="address"
                        type="text"
                        value={form.address}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Location &amp; Background</legend>
                  <div className="grid">
                    <div className="field">
                      <label htmlFor="country">Country</label>
                      <select
                        id="country"
                        name="country"
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
                    <div className="field">
                      <label htmlFor="city">City</label>
                      <input
                        id="city"
                        name="city"
                        type="text"
                        value={form.city}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="nationality">Nationality</label>
                      <input
                        id="nationality"
                        name="nationality"
                        type="text"
                        value={form.nationality}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="occupation">
                        Occupation <span className="opt">(optional)</span>
                      </label>
                      <input
                        id="occupation"
                        name="occupation"
                        type="text"
                        value={form.occupation}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="bloodGroup">
                        Blood Group <span className="opt">(optional)</span>
                      </label>
                      <input
                        id="bloodGroup"
                        name="bloodGroup"
                        type="text"
                        placeholder="e.g. O+"
                        value={form.bloodGroup}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Emergency Contact</legend>
                  <div className="grid">
                    <div className="field">
                      <label htmlFor="emergencyContactName">Contact Name</label>
                      <input
                        id="emergencyContactName"
                        name="emergencyContactName"
                        type="text"
                        pattern={NAME_PATTERN}
                        title={NAME_TITLE}
                        value={form.emergencyContactName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="emergencyContactRelationship">
                        Relationship
                      </label>
                      <input
                        id="emergencyContactRelationship"
                        name="emergencyContactRelationship"
                        type="text"
                        value={form.emergencyContactRelationship}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="emergencyContactPhone">
                        Contact Phone
                      </label>
                      <input
                        id="emergencyContactPhone"
                        name="emergencyContactPhone"
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
                </fieldset>

                <TermsAgreement
                  id="signup-terms-agreement"
                  to="/terms/signup"
                  checked={agreedToTerms}
                  onChange={setAgreedToTerms}
                />

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={submitting || !agreedToTerms}
                >
                  {submitting ? 'Registering...' : 'Register'}
                </button>
              </form>

              <p className="register-footer">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
