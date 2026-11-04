import { useEffect, useState } from 'react'
import { isNative } from '../utils/geo'

// The app-shell build has no marketing pages to fall back to and every
// screen it ships is API-backed, so a dropped connection otherwise reads as
// a frozen app rather than "no signal" - this is skipped entirely on the
// website (isNative is false there), which already has its own per-request
// error handling for flaky connections.
export default function OfflineOverlay() {
  const [offline, setOffline] = useState(
    isNative && typeof navigator !== 'undefined' && !navigator.onLine
  )

  useEffect(() => {
    if (!isNative) return
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        background: '#1a1410',
        color: '#fff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 48 }}>📡</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>No connection</div>
      <div style={{ fontSize: 15, opacity: 0.8, maxWidth: 280 }}>
        Run Conquest needs a connection to track territory. Reconnect to keep
        playing.
      </div>
      <button
        type="button"
        onClick={() => setOffline(!navigator.onLine)}
        style={{
          marginTop: 8,
          padding: '10px 24px',
          borderRadius: 999,
          border: 'none',
          background: '#DD571C',
          color: '#fff',
          fontWeight: 600,
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
