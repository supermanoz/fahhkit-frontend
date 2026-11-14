/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { isNative } from '../utils/geo'
import { describeGoogleSignInError } from '../utils/googleSignInErrors'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GSI_SRC = 'https://accounts.google.com/gsi/client'
let googleAuthInitialized = false

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
function GoogleSignInButtonWeb({ onCredential, onError }) {
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
          callback: (response) => {
            if (response?.credential) {
              handlersRef.current.onCredential(response.credential)
            } else {
              handlersRef.current.onError?.()
            }
          },
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
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
  }, [])

  if (!GOOGLE_CLIENT_ID || failed) return null
  return <div ref={containerRef} className="google-signin-button" />
}

function GoogleSignInButtonNative({ onCredential, onError }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (googleAuthInitialized) return
    googleAuthInitialized = true
    GoogleAuth.initialize()
  }, [])

  async function handleClick() {
    setBusy(true)
    try {
      const user = await GoogleAuth.signIn()
      if (user?.authentication?.idToken) {
        onCredential(user.authentication.idToken)
      } else {
        onError?.('Google returned no sign-in token. Please try again.')
      }
    } catch (err) {
      // Say what went wrong (Play Services status code -> text, see
      // utils/googleSignInErrors.js) instead of failing silently; a plain
      // cancel of the account picker (12501) stays quiet.
      const { message, cancelled, code } = describeGoogleSignInError(err)
      if (cancelled) return
      console.warn('[GoogleSignIn] native sign-in failed', code, err)
      onError?.(message)
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
      Continue with Google
    </button>
  )
}

export default function GoogleSignInButton({ onCredential, onError }) {
  if (!GOOGLE_CLIENT_ID) return null
  return isNative ? (
    <GoogleSignInButtonNative onCredential={onCredential} onError={onError} />
  ) : (
    <GoogleSignInButtonWeb onCredential={onCredential} onError={onError} />
  )
}
