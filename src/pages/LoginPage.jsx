import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { postJson, getJson, setToken, setUser, ApiError } from '../api/client'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import PasswordField from '../components/PasswordField'
import GoogleSignInButton from '../components/GoogleSignInButton'
import './LoginPage.css'

const INITIAL_FORM = { mobileNumber: '', password: '' }

export default function LoginPage() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const location = useLocation()
  const [banner, setBanner] = useState(
    location.state?.message
      ? { kind: 'success', message: location.state.message }
      : null
  )
  const navigate = useNavigate()

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
      const data = await postJson('/v1/authenticate', form)
      if (data.firstLogin && data.userType === 'MODERATOR') {
        navigate('/update-password', {
          state: {
            mobileNumber: form.mobileNumber,
            message: 'First time signing in? Set a new password to continue.',
          },
        })
        return
      }
      await finishSignIn(data)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Sign in failed. Please try again.'
      setBanner({ kind: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  // Shared tail of password and Google sign-in: store the token, load the
  // user, and head back to wherever sent them here.
  async function finishSignIn(data) {
    setToken(data.tokenId)
    const user = await getJson('/v1/user/find/logged-in')
    setUser(user)
    // Pages that gate on sign-in pass `state.from` so the user lands back
    // where they were. Only same-origin paths - never a `//host` redirect.
    const from = location.state?.from
    const redirectTo =
      typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
        ? from
        : '/'
    navigate(redirectTo, {
      state: {
        message: `Welcome back, ${user?.fullName || 'athlete'}! You're signed in.`,
      },
    })
  }

  async function handleGoogleCredential(idToken) {
    setBanner(null)
    setSubmitting(true)
    try {
      const data = await postJson('/v1/auth/google', { idToken })
      await finishSignIn(data)
    } catch (err) {
      setBanner({
        kind: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Google sign-in failed. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <Navbar />
      <div className="login-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="login-card glass-card" data-aos="fade-up">
          <header className="login-header">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="FahhKit"
              className="login-logo"
            />
            <h1>Welcome Back</h1>
            <p>Sign in with your mobile number or email to continue</p>
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
            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordField
                id="password"
                name="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            <p className="login-forgot">
              <Link to="/forgot-password">Forgot password?</Link>
            </p>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <GoogleSignInButtonBlock
            onCredential={handleGoogleCredential}
            onError={() =>
              setBanner({
                kind: 'error',
                message: 'Google sign-in was cancelled or failed.',
              })
            }
          />

          <p className="login-footer">
            New to FahhKit? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

// "or" divider + button, only when Google sign-in is configured.
function GoogleSignInButtonBlock(props) {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null
  return (
    <div className="login-oauth">
      <div className="login-divider">
        <span>or</span>
      </div>
      <GoogleSignInButton {...props} />
    </div>
  )
}
