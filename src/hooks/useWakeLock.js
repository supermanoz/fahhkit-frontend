import { useCallback, useEffect, useRef } from 'react'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { isNative } from '../utils/geo'

// The Screen Wake Lock is released automatically by the browser when the tab
// is hidden, so it has to be re-requested on visibilitychange — otherwise the
// screen can sleep mid-run after the user briefly switches apps. Only used
// as a fallback on the native shell when the WebView's own 'wakeLock' isn't
// available — if it is, that path is unchanged from the web version.
export function useWakeLock() {
  const sentinelRef = useRef(null)
  const wantLockRef = useRef(false)
  const nativeLockRef = useRef(false)

  const request = useCallback(async () => {
    wantLockRef.current = true
    if (!('wakeLock' in navigator)) {
      if (!isNative) return
      try {
        await KeepAwake.keepAwake()
        nativeLockRef.current = true
      } catch {
        // Unsupported on this device — tracking still works, screen may just sleep.
      }
      return
    }
    try {
      sentinelRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Denied or unsupported in this context — tracking still works, screen may just sleep.
    }
  }, [])

  const release = useCallback(async () => {
    wantLockRef.current = false
    if (nativeLockRef.current) {
      nativeLockRef.current = false
      try {
        await KeepAwake.allowSleep()
      } catch {
        // no-op
      }
    }
    try {
      await sentinelRef.current?.release()
    } catch {
      // no-op
    }
    sentinelRef.current = null
  }, [])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && wantLockRef.current) {
        request()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [request])

  useEffect(() => () => release(), [release])

  return { request, release }
}
