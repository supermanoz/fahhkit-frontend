import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addPushListeners,
  ensurePushChannels,
  getPushPermission,
  hasAskedForPushPermission,
  markPushPermissionAsked,
  openNotificationSettings,
  pushSupported,
  requestPushPermission,
  startPushRegistration,
  syncPushToken,
} from '../utils/push'
import { foregroundToastText, resolvePendingTap } from '../utils/pushRouting'

// Push client for the game. A no-op on the website (and on iOS while IOS_PUSH
// is off), so callers need no feature-detection.
//
// - userId: only registers while logged in.
// - gameReady: taps (cold start included) are held until the game has loaded.
// - canPrompt: the OS permission dialog is only ever shown when this is true
//   (game loaded, no run in progress) and only once automatically; after that
//   it comes from the Settings toggles.
// - onRoute(route): see pushRouting.routeForPush.
// - onForeground(text): a push arrived while the app is open - show the
//   in-app toast instead of an OS banner.
export function usePushNotifications({
  userId,
  gameReady,
  canPrompt,
  onRoute,
  onForeground,
}) {
  const supported = pushSupported()
  const [permission, setPermission] = useState('unknown')
  const [pendingTap, setPendingTap] = useState(null)
  const onRouteRef = useRef(onRoute)
  const onForegroundRef = useRef(onForeground)
  onRouteRef.current = onRoute
  onForegroundRef.current = onForeground

  // Listeners go up as soon as there is a user - a tap that launched the app
  // is delivered to the first listener, so this must not wait for gameReady.
  useEffect(() => {
    if (!supported || !userId) return
    let cleanup = null
    let cancelled = false
    addPushListeners({
      onToken: (token) => syncPushToken(token),
      onForeground: (notification) => {
        const text = foregroundToastText(notification)
        if (text) onForegroundRef.current?.(text)
      },
      onTap: (data) => setPendingTap(data),
    })
      .then((remove) => {
        if (cancelled) remove()
        else cleanup = remove
      })
      .catch(() => {})
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [supported, userId])

  // Route a held tap once logged in and the game has loaded.
  useEffect(() => {
    const route = resolvePendingTap(pendingTap, {
      isAuthed: Boolean(userId),
      gameReady,
    })
    if (!route) return
    setPendingTap(null)
    onRouteRef.current?.(route)
  }, [pendingTap, userId, gameReady])

  // Channels + token registration (+ the one automatic permission ask).
  useEffect(() => {
    if (!supported || !userId || !canPrompt) return
    let cancelled = false
    ;(async () => {
      try {
        await ensurePushChannels()
        let status = await getPushPermission()
        if (status === 'prompt' && !hasAskedForPushPermission()) {
          markPushPermissionAsked()
          status = await requestPushPermission()
        }
        if (cancelled) return
        setPermission(status)
        if (status === 'granted') await startPushRegistration()
      } catch {
        // Retry on next app open.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supported, userId, canPrompt])

  // From the Settings toggles: ask (Android only shows the dialog while it
  // hasn't been denied twice), then register if allowed.
  const requestPermission = useCallback(async () => {
    if (!supported) return 'denied'
    try {
      markPushPermissionAsked()
      const status = await requestPushPermission()
      setPermission(status)
      if (status === 'granted') await startPushRegistration()
      return status
    } catch {
      return 'denied'
    }
  }, [supported])

  const refreshPermission = useCallback(async () => {
    if (!supported) return
    try {
      setPermission(await getPushPermission())
    } catch {
      // Leave as-is.
    }
  }, [supported])

  return {
    supported,
    permission,
    requestPermission,
    refreshPermission,
    openSystemSettings: openNotificationSettings,
  }
}
