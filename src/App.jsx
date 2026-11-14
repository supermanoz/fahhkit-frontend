import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AOS from 'aos'
import GamePage from './pages/GamePage'
import OfflineOverlay from './components/OfflineOverlay'

// `npm run build:app` (the Capacitor/Android/iOS build) sets this. The native
// app is the game only: "/" and every website route redirect to /game, and
// the website pages (WebShell) are never imported - the dynamic import below
// sits in a branch Vite folds away at build time, so that chunk isn't even
// emitted into the native bundle. The website build keeps all its routes.
const APP_SHELL = import.meta.env.VITE_APP_SHELL === 'true'
const WebShell = APP_SHELL ? null : lazy(() => import('./WebShell'))

export default function App() {
  useEffect(() => {
    AOS.init({ duration: 700, once: true, offset: 40 })
  }, [])

  return (
    <>
      <OfflineOverlay />
      {APP_SHELL ? (
        // /game (incl. its in-game sign in / sign up / forgot password) is
        // the only screen. /payment-status, /login, /shop, ... all land
        // here too: payment return is handled by GamePage's own
        // resume-refresh of the balance (see its appStateChange listener).
        <Routes>
          <Route path="/game" element={<GamePage />} />
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      ) : (
        <Suspense fallback={null}>
          <WebShell />
        </Suspense>
      )}
    </>
  )
}
