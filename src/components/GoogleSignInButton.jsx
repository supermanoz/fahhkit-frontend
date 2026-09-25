/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'

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
export default function GoogleSignInButton({ onCredential, onError }) {
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
