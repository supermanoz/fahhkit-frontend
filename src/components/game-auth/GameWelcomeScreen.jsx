/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import AuthLogo from './AuthLogo'
import { AuthBanner } from './AuthParts'
import GameButton from '../../game/ui/GameButton'
import GoogleSignInButton from '../GoogleSignInButton'
import AppleSignInButton from '../AppleSignInButton'
import { isIosAppleSignInEnabled } from '../../utils/appleSignIn'
import { isNative } from '../../utils/geo'

const HAS_GOOGLE = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

export default function GameWelcomeScreen({
  onSignIn,
  onSignUp,
  onGoogleCredential,
  onAppleCredential,
  onOAuthError,
  banner,
}) {
  // Native iOS: the Apple sheet (flag-gated). Never on Android; the web
  // Apple flow only when a Services ID is configured (not in the native app).
  const HAS_APPLE =
    isIosAppleSignInEnabled() ||
    (!isNative && Boolean(import.meta.env.VITE_APPLE_CLIENT_ID))
  return (
    <div className="game-auth-card">
      <AuthLogo />
      <div className="game-auth-header">
        <h1 className="game-auth-title">Claim the streets</h1>
        <p className="game-auth-subtitle">
          Sign in to track runs, capture territory and earn Fahhcoin.
        </p>
      </div>

      <AuthBanner banner={banner} />

      <div className="game-auth-welcome-buttons">
        <GameButton
          variant="success"
          size="lg"
          className="g-full-width"
          onClick={onSignIn}
        >
          Sign In
        </GameButton>
        <GameButton
          variant="secondary"
          size="lg"
          className="g-full-width"
          onClick={onSignUp}
        >
          Create Account
        </GameButton>
      </div>

      {(HAS_GOOGLE || HAS_APPLE) && (
        <div className="game-auth-oauth">
          <div className="game-auth-divider">
            <span>or</span>
          </div>
          {HAS_GOOGLE && (
            <GoogleSignInButton
              appearance="game"
              onCredential={onGoogleCredential}
              onError={(message, info) => onOAuthError('Google', message, info)}
            />
          )}
          {HAS_APPLE && (
            <AppleSignInButton
              onCredential={onAppleCredential}
              onError={(message, info) => onOAuthError('Apple', message, info)}
            />
          )}
        </div>
      )}
    </div>
  )
}
