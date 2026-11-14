/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import runConquestLogo from '../../assets/ui/brand/run_conquest_logo-ui.webp'
import GoogleSignInButton from '../GoogleSignInButton'
import AppleSignInButton from '../AppleSignInButton'

const HAS_GOOGLE = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
const HAS_APPLE = Boolean(import.meta.env.VITE_APPLE_CLIENT_ID)

export default function GameWelcomeScreen({
  onSignIn,
  onSignUp,
  onGoogleCredential,
  onAppleCredential,
  onOAuthError,
  banner,
}) {
  return (
    <div className="game-auth-card">
      <img
        src={runConquestLogo}
        alt="Run Conquest"
        className="game-auth-logo"
      />
      <div className="game-auth-header">
        <h1 className="game-auth-title">Claim the streets</h1>
        <p className="game-auth-subtitle">
          Sign in to track runs, capture territory, and earn Fahhcoin.
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

      <div className="game-auth-welcome-buttons">
        <button type="button" className="game-auth-submit" onClick={onSignIn}>
          Sign In
        </button>
        <button
          type="button"
          className="game-auth-secondary"
          onClick={onSignUp}
        >
          Create Account
        </button>
      </div>

      {(HAS_GOOGLE || HAS_APPLE) && (
        <div className="game-auth-oauth">
          <div className="game-auth-divider">
            <span>or</span>
          </div>
          {HAS_GOOGLE && (
            <GoogleSignInButton
              onCredential={onGoogleCredential}
              onError={() => onOAuthError('Google')}
            />
          )}
          {HAS_APPLE && (
            <AppleSignInButton
              onCredential={onAppleCredential}
              onError={() => onOAuthError('Apple')}
            />
          )}
        </div>
      )}
    </div>
  )
}
