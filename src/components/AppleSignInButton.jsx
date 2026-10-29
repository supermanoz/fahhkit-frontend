/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import './AppleSignInButton.css'

const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID || ''
const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

let appleScriptPromise = null

function loadAppleScript() {
  if (window.AppleID?.auth) return Promise.resolve()
  if (!appleScriptPromise) {
    appleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = APPLE_JS_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => {
        appleScriptPromise = null
        reject(new Error('Apple sign-in failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return appleScriptPromise
}

// Sign in with Apple JS. Unlike Google's GSI (which renders its own button
// into a container), Apple's SDK only exposes an imperative
// AppleID.auth.signIn() call - the button itself is ours to style, so it
// matches the surrounding card/game chrome instead of looking like a stray
// Google button with no counterpart.
//
// The backend's POST /v1/auth/apple (AuthServiceImpl.findOrLinkOrCreateOAuthUser)
// verifies the identity token and creates/links the account - same shape of
// response as /v1/authenticate and /v1/auth/google. Apple only ever sends
// the athlete's name on their *first* authorization (never again on later
// sign-ins), so it's captured here and forwarded as `fullName` - the backend
// already knows to only use it when creating a brand new account.
export default function AppleSignInButton({ onCredential, onError }) {
  const handlersRef = useRef({ onCredential, onError })
  handlersRef.current = { onCredential, onError }
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!APPLE_CLIENT_ID) return
    let cancelled = false
    loadAppleScript()
      .then(() => {
        if (cancelled) return
        window.AppleID.auth.init({
          clientId: APPLE_CLIENT_ID,
          scope: 'name email',
          redirectURI: window.location.origin,
          usePopup: true,
        })
        setReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function handleClick() {
    setBusy(true)
    try {
      const response = await window.AppleID.auth.signIn()
      const identityToken = response?.authorization?.id_token
      if (!identityToken) {
        handlersRef.current.onError?.()
        return
      }
      const name = response?.user?.name
      const fullName = name
        ? [name.firstName, name.lastName].filter(Boolean).join(' ')
        : undefined
      handlersRef.current.onCredential(identityToken, fullName)
    } catch {
      // Apple rejects the promise both when the popup is blocked and when
      // the athlete just closes it themselves - same "cancelled or failed"
      // treatment either way, matching GoogleSignInButton's onError.
      handlersRef.current.onError?.()
    } finally {
      setBusy(false)
    }
  }

  if (!APPLE_CLIENT_ID) return null
  return (
    <button
      type="button"
      className="apple-signin-button"
      onClick={handleClick}
      disabled={!ready || busy}
    >
      <svg
        viewBox="0 0 814 1000"
        aria-hidden="true"
        className="apple-signin-icon"
      >
        <path
          fill="currentColor"
          d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-163.9-39.5c-76.7 0-104 39.5-166.5 39.5s-105.9-57-150.5-121.9C50.1 823.6 1.4 683.2 1.4 550.3c0-203.1 132-310.8 262.1-310.8 70.2 0 128.8 41.6 169.2 41.6 38.4 0 101.3-44.1 174.1-44.1 28.1 0 129.1 2.3 180.6 136.9zm-257-266.5c17.7-22.4 32.4-55.2 32.4-88.2 0-4.8-.4-9.6-1.3-13.6-26 1.1-56.4 17.4-78.6 41.4-20.3 22.4-37.8 54.7-37.8 87.7 0 5.1.9 10.1 1.3 11.6 2 .3 5.2.6 8.6.6 22.3 0 50.4-15.3 75.4-39.5z"
        />
      </svg>
      {busy ? 'Signing in…' : 'Continue with Apple'}
    </button>
  )
}
