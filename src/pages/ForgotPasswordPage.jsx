import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthFlow, authErrorMessage } from '../hooks/useAuthFlow'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './ForgotPasswordPage.css'

const INITIAL_FORM = { mobileNumber: '' }

export default function ForgotPasswordPage() {
  const auth = useAuthFlow()
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState(null)
  const [sent, setSent] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBanner(null)
    if (!e.target.reportValidity()) return

    setSubmitting(true)
    try {
      await auth.forgotPassword(form.mobileNumber)
      setSent(true)
    } catch (err) {
      setBanner({
        kind: 'error',
        message: authErrorMessage(
          err,
          'Something went wrong. Please try again.'
        ),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="forgot-page">
      <Navbar />
      <div className="forgot-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="forgot-card glass-card" data-aos="fade-up">
          {sent ? (
            <div className="forgot-sent">
              <div className="forgot-sent-icon" aria-hidden="true">
                📧
              </div>
              <h1>Check your inbox!</h1>
              <p>
                We&apos;ve emailed you a new password — open it and sign in
                below.
              </p>
              <Link to="/login" className="btn btn-primary">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <header className="forgot-header">
                <div className="forgot-logo">🔑</div>
                <h1>Forgot Password</h1>
                <p>
                  Enter your mobile number or email to receive a new password
                </p>
              </header>

              {banner && (
                <div className={`banner ${banner.kind}`}>{banner.message}</div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="mobileNumber">Mobile Number or Email</label>
                  <input
                    id="mobileNumber"
                    name="mobileNumber"
                    type="text"
                    autoComplete="username"
                    placeholder="98XXXXXXXX or you@example.com"
                    value={form.mobileNumber}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={submitting}
                >
                  {submitting ? 'Sending...' : 'Send New Password'}
                </button>
              </form>
            </>
          )}

          {!sent && (
            <p className="forgot-footer">
              <Link to="/login">Back to sign in</Link>
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
