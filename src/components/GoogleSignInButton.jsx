/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { isNative, platform } from '../utils/geo'
import {
  ensureGoogleAuthInitialized,
  googleSignOut,
} from '../utils/googleSession'
import GoogleGLogo from './GoogleGLogo'
import {
  AUTH_FLOW,
  MESSAGES,
  describeAuthError,
  logAuthError,
} from '../utils/authErrors'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GSI_SRC = 'https://accounts.google.com/gsi/client'

let gsiScriptPromise = null

function loadGsiScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => {
        gsiScriptPromise = null
        reject(new Error('Google sign-in failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return gsiScriptPromise
}

// Google Identity Services button. Google hands back an ID token (a signed
// JWT); the backend's POST /v1/auth/google verifies it and signs the player
// in, creating the account on first use. Renders nothing when no client id
// is configured, so a build without VITE_GOOGLE_CLIENT_ID just shows the
// normal password form.
//
// The web GSI flow (an iframe/popup to accounts.google.com) is blocked by
// Google inside a WebView - see GoogleSignInButtonNative below for the
// native-app path, which uses the OS account picker instead and produces an
// ID token audienced the same way (serverClientId in capacitor.config.json
// is set to this same GOOGLE_CLIENT_ID), so the backend's verification is
// unchanged either way.
function GoogleSignInButtonWeb({ onCredential, onError, appearance }) {
  const containerRef = useRef(null)
  const handlersRef = useRef({ onCredential, onError })
  handlersRef.current = { onCredential, onError }
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    loadGsiScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          auto_select: false,
          callback: (response) => {
            if (response?.credential) {
              handlersRef.current.onCredential(response.credential)
            } else {
              handlersRef.current.onError?.(MESSAGES.provider('Google'))
            }
          },
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          // In-game: Google's own white "outline" button (official G logo,
          // "Continue with Google") - the only form Google allows for the
          // web button. Elsewhere the original dark pill.
          theme: appearance === 'game' ? 'outline' : 'filled_black',
          size: 'large',
          shape: appearance === 'game' ? 'rectangular' : 'pill',
          text: 'continue_with',
          width: Math.min(containerRef.current.offsetWidth || 320, 400),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [appearance])

  if (!GOOGLE_CLIENT_ID || failed) return null
  return (
    <div
      ref={containerRef}
      className={`google-signin-button${appearance === 'game' ? ' google-signin-button--game' : ''}`}
    />
  )
}

function GoogleSignInButtonNative({ onCredential, onError }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ensureGoogleAuthInitialized()
  }, [])

  async function handleClick() {
    setBusy(true)
    try {
      // Always start from a clean plugin state so Google shows the account
      // chooser instead of silently reusing the last account.
      await googleSignOut()
      const user = await GoogleAuth.signIn()
      if (user?.authentication?.idToken) {
        onCredential(user.authentication.idToken)
      } else {
        const info = describeAuthError(new Error('no token'), {
          flow: AUTH_FLOW.GOOGLE,
        })
        onError?.(info.message, info)
      }
    } catch (err) {
      // Technical detail goes to the console only; the player sees a friendly
      // line (see utils/authErrors.js) - and nothing at all when they simply
      // closed the account picker.
      logAuthError(AUTH_FLOW.GOOGLE, err)
      const info = describeAuthError(err, { flow: AUTH_FLOW.GOOGLE })
      if (info.silent) return
      onError?.(info.message, info)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="google-signin-button google-signin-button--native"
      onClick={handleClick}
      disabled={busy}
    >
      <GoogleGLogo className="google-signin-logo" />
      <span>Continue with Google</span>
    </button>
  )
}

export default function GoogleSignInButton({
  onCredential,
  onError,
  appearance,
}) {
  if (!GOOGLE_CLIENT_ID) return null
  // No iOS OAuth client id exists yet (capacitor.config.json only has the
  // Android one), so native Google sign-in can't work on iOS: hide it there
  // until VITE_IOS_GOOGLE=true is set alongside a real iosClientId.
  if (
    isNative &&
    platform === 'ios' &&
    import.meta.env.VITE_IOS_GOOGLE !== 'true'
  )
    return null
  return isNative ? (
    <GoogleSignInButtonNative onCredential={onCredential} onError={onError} />
  ) : (
    <GoogleSignInButtonWeb
      onCredential={onCredential}
      onError={onError}
      appearance={appearance}
    />
  )
}
