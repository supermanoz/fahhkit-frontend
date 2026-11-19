import { useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useAuthFlow, authErrorMessage } from '../hooks/useAuthFlow'
import {
  AUTH_FLOW,
  MESSAGES,
  describeAuthError,
  logAuthError,
} from '../utils/authErrors'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import PasswordField from '../components/PasswordField'
import GoogleSignInButton from '../components/GoogleSignInButton'
import AppleSignInButton from '../components/AppleSignInButton'
import './LoginPage.css'
import { playerNameOf } from '../utils/playerName'
import { nextMessage, sanitizeNext } from '../utils/safeNext'

const INITIAL_FORM = { mobileNumber: '', password: '' }

export default function LoginPage() {
  const auth = useAuthFlow()
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Where to go after signing in: ?next= (set by RequireAuth / a rejected
  // session) or the older router state `from`. Validated - a same-site path
  // only, never another host - and the query string is kept (e.g. payment
  // parameters).
  const next = sanitizeNext(
    searchParams.get('next') ?? location.state?.from,
    null
  )
  const [banner, setBanner] = useState(() => {
    if (location.state?.message)
      return { kind: 'success', message: location.state.message }
    const hint = nextMessage(next)
    return hint ? { kind: 'info', message: hint } : null
  })
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
      const data = await auth.signIn(form.mobileNumber, form.password)
      if (data.firstLogin && data.userType === 'MODERATOR') {
        navigate('/update-password', {
          state: {
            mobileNumber: form.mobileNumber,
            message: 'First time signing in? Set a new password to continue.',
          },
        })
        return
      }
      await completeSignIn(data)
    } catch (err) {
      setBanner({
        kind: 'error',
        message: authErrorMessage(err, 'Sign in failed. Please try again.'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Shared tail of password, Google and Apple sign-in: store the token, load
  // the user, and head back to wherever sent them here.
  async function completeSignIn(data) {
    const user = await auth.finishSignIn(data)
    // Back to where they were headed (validated above), else the home page.
    navigate(next ?? '/', {
      replace: true,
      state: {
        message: `Welcome back, ${playerNameOf(user) || 'athlete'}! You're signed in.`,
      },
    })
  }

  async function handleGoogleCredential(idToken) {
    setBanner(null)
    setSubmitting(true)
    try {
      const data = await auth.signInWithGoogle(idToken)
      await completeSignIn(data)
    } catch (err) {
      logAuthError(AUTH_FLOW.GOOGLE, err)
      setBanner({
        kind: 'error',
        message: describeAuthError(err, { flow: AUTH_FLOW.GOOGLE }).message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAppleCredential(identityToken, fullName) {
    setBanner(null)
    setSubmitting(true)
    try {
      const data = await auth.signInWithApple(identityToken, fullName)
      await completeSignIn(data)
    } catch (err) {
      logAuthError(AUTH_FLOW.APPLE, err)
      setBanner({
        kind: 'error',
        message: describeAuthError(err, { flow: AUTH_FLOW.APPLE }).message,
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

          <OAuthButtonsBlock
            onGoogleCredential={handleGoogleCredential}
            onAppleCredential={handleAppleCredential}
            onError={(provider, detail) =>
              setBanner({
                kind: 'error',
                message: detail || MESSAGES.provider(provider),
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

// "or" divider + button(s), only when at least one OAuth provider is
// configured (each button already degrades to rendering nothing on its own
// when its client id env var is unset).
/* eslint-disable-next-line react/prop-types -- no prop-types dependency in this project */
function OAuthButtonsBlock({ onGoogleCredential, onAppleCredential, onError }) {
  const hasGoogle = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
  const hasApple = Boolean(import.meta.env.VITE_APPLE_CLIENT_ID)
  if (!hasGoogle && !hasApple) return null
  return (
    <div className="login-oauth">
      <div className="login-divider">
        <span>or</span>
      </div>
      {hasGoogle && (
        <GoogleSignInButton
          onCredential={onGoogleCredential}
          onError={(detail) => onError('Google', detail)}
        />
      )}
      {hasApple && (
        <AppleSignInButton
          onCredential={onAppleCredential}
          onError={() => onError('Apple')}
        />
      )}
    </div>
  )
}
