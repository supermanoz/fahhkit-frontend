/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useIsOnline } from '../utils/connectivity'
import {
  getStorageProblem,
  subscribeStorageProblem,
} from '../utils/storageHealth'
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
export default function ConnectionBanner({
  enabled = true,
  waiting = 0,
  onOpen,
}) {
  const online = useIsOnline()
  const storageProblem = useSyncExternalStore(
    subscribeStorageProblem,
    getStorageProblem,
    () => null
  )
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

  // Priority: the phone can't save the run > offline > uploading saved runs >
  // "Back online" > nothing.
  let shown = phase
  if (storageProblem) shown = 'storage'
  else if (phase === 'hidden' && online && waiting > 0) shown = 'syncing'
  const isOffline = shown === 'offline'
  const isWarn = isOffline || shown === 'storage'
  const runsWord = `${waiting} run${waiting === 1 ? '' : 's'}`
  const text = {
    storage: 'Phone storage is full - free some space so your run can be saved',
    offline:
      waiting > 0
        ? `You're offline - ${runsWord} saved on your phone`
        : "You're offline - runs are saved on your phone",
    syncing: `Uploading ${runsWord} saved on your phone…`,
    back: 'Back online',
  }[shown]
  return (
    <div className="conn-banner-layer" data-testid="connection-banner-layer">
      {/* wait: the offline pill finishes leaving before "Back online" enters,
          so two pills are never on screen together. */}
      <AnimatePresence mode="wait">
        {shown !== 'hidden' && (
          <motion.div
            key={shown}
            className={`conn-banner ${isWarn ? 'is-offline' : 'is-online'}`}
            onClick={onOpen}
            style={
              onOpen ? { pointerEvents: 'auto', cursor: 'pointer' } : undefined
            }
            role="status"
            aria-live="polite"
            data-testid="connection-banner"
            data-state={shown}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: 'easeOut' }}
          >
            <span className="conn-banner-icon">
              {isWarn ? <CloudOffIcon /> : <CheckIcon />}
            </span>
            <span className="conn-banner-text">{text}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {isOffline && (
        <div className="conn-map-chip" data-testid="map-offline-chip">
          Map tiles may not load offline
        </div>
      )}
    </div>
  )
}
