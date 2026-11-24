/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useIsOnline } from '../utils/connectivity'
import './ConnectionBanner.css'

export const BACK_ONLINE_MS = 3000

function CloudOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6.5 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.4 8.4 4.6 4.6 0 0 1 17.5 19H6.5Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Small status pill under the HUD. Offline: stays for as long as it lasts.
// Back online: a green "Back online" for ~3 s, then slides out. `enabled`
// holds it back during the very first load so it never flickers in with the
// loading screen.
export default function ConnectionBanner({ enabled = true }) {
  const online = useIsOnline()
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState('hidden') // hidden | offline | back
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!enabled) return undefined
    if (!online) {
      wasOffline.current = true
      setPhase('offline')
      return undefined
    }
    if (wasOffline.current) {
      wasOffline.current = false
      setPhase('back')
      const t = setTimeout(() => setPhase('hidden'), BACK_ONLINE_MS)
      return () => clearTimeout(t)
    }
    return undefined
  }, [online, enabled])

  const isOffline = phase === 'offline'
  return (
    <div className="conn-banner-layer" data-testid="connection-banner-layer">
      {/* wait: the offline pill finishes leaving before "Back online" enters,
          so two pills are never on screen together. */}
      <AnimatePresence mode="wait">
        {phase !== 'hidden' && (
          <motion.div
            key={phase}
            className={`conn-banner ${isOffline ? 'is-offline' : 'is-online'}`}
            role="status"
            aria-live="polite"
            data-testid="connection-banner"
            data-state={phase}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: 'easeOut' }}
          >
            <span className="conn-banner-icon">
              {isOffline ? <CloudOffIcon /> : <CheckIcon />}
            </span>
            <span className="conn-banner-text">
              {isOffline
                ? "You're offline - runs are saved on your phone"
                : 'Back online'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
