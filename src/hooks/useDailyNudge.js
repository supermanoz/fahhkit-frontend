import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from '../utils/geo'
import {
  NUDGE_KIND,
  cancelDailyNudge,
  scheduleDailyNudge,
} from '../utils/dailyNudge'

// Keeps the single come-back reminder in step with the session: rescheduled
// (24h out) on app start / resume while logged in, cancelled on logout. Run
// saves call scheduleDailyNudge() directly. No-op on the website.
export function useDailyNudge({ isAuthed, loading }) {
  const navigate = useNavigate()
  const authedRef = useRef(false)
  authedRef.current = isAuthed

  useEffect(() => {
    if (!isNative || loading) return
    if (isAuthed) scheduleDailyNudge()
    else cancelDailyNudge()
  }, [isAuthed, loading])

  useEffect(() => {
    if (!isNative) return
    const resume = CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive && authedRef.current) scheduleDailyNudge()
    })
    // Tapping the reminder opens the game on its main map.
    const tap = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event) => {
        if (event.notification?.extra?.kind === NUDGE_KIND) {
          navigate('/game', { replace: true })
        }
      }
    )
    return () => {
      resume.then((h) => h.remove())
      tap.then((h) => h.remove())
    }
  }, [navigate])
}
