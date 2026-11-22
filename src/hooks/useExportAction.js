import { useCallback, useEffect, useRef, useState } from 'react'
import { isSfxMuted, playSfx } from '../utils/gameSound'

export const EXPORT_STATE = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
})

export const EXPORT_MESSAGES = Object.freeze({
  saved: 'Saved to Photos', // iPhone
  savedGallery: 'Saved to Gallery', // Android
  downloaded: 'Downloaded', // web
  shared: 'Shared',
  failed: "Couldn't save. Check Photos permission and try again.",
  failedShort: "Couldn't save", // the toast; the full sentence sits under the button
  permissionDenied: 'Photos access is off',
})

export class ExportTimeoutError extends Error {
  constructor() {
    super('Export timed out')
    this.name = 'ExportTimeoutError'
  }
}

// Rejects with ExportTimeoutError if `promise` takes longer than `ms`.
export function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ExportTimeoutError()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Resolves after the browser has painted the current state (the spinner), so
// the heavy canvas/PNG work that follows can't delay it.
const nextPaint = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0))
    } else {
      setTimeout(resolve, 16)
    }
  })

// One behaviour for every "make an image and save/share it" button:
// idle -> loading (>= minLoadingMs, so the spinner is always seen) -> success
// (~1.5s, then back to idle) or error (button re-enabled). Re-taps while
// loading are ignored. `run()` resolves { message, silent?, permissionDenied? }
// - `silent` returns straight to idle (e.g. the user closed the share sheet) -
// or throws. `timeoutMs: null` skips the overall timeout (the share sheet
// stays open for as long as the player likes; wrap only the render step in
// withTimeout there). `onNotify({ type, message })` feeds the popup toast.
export function useExportAction(
  run,
  {
    minLoadingMs = 600,
    timeoutMs = 15000,
    successMs = 2000,
    onNotify,
    sound = true,
  } = {}
) {
  const [state, setState] = useState(EXPORT_STATE.IDLE)
  const [message, setMessage] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const resetTimer = useRef(null)
  const runRef = useRef(run)
  runRef.current = run
  const notifyRef = useRef(onNotify)
  notifyRef.current = onNotify

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(resetTimer.current)
    }
  }, [])

  const trigger = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    clearTimeout(resetTimer.current)
    setPermissionDenied(false)
    setState(EXPORT_STATE.LOADING)
    const startedAt = Date.now()
    let outcome
    try {
      // Loading state first, painted, THEN the export work.
      const job = nextPaint().then(() => runRef.current())
      outcome = {
        ok: true,
        result: await (timeoutMs ? withTimeout(job, timeoutMs) : job),
      }
    } catch (error) {
      outcome = { ok: false, error }
    }
    const remaining = minLoadingMs - (Date.now() - startedAt)
    if (remaining > 0) await sleep(remaining)
    busyRef.current = false
    if (!mountedRef.current) return

    if (outcome.ok && outcome.result?.silent) {
      setState(EXPORT_STATE.IDLE)
      return
    }
    if (outcome.ok && !outcome.result?.permissionDenied) {
      const text = outcome.result?.message || EXPORT_MESSAGES.downloaded
      setMessage(text)
      setState(EXPORT_STATE.SUCCESS)
      notifyRef.current?.({ type: 'success', message: text })
      if (sound && !isSfxMuted()) playSfx('pop')
      resetTimer.current = setTimeout(() => {
        if (mountedRef.current) setState(EXPORT_STATE.IDLE)
      }, successMs)
      return
    }
    const denied = Boolean(outcome.ok && outcome.result?.permissionDenied)
    setPermissionDenied(denied)
    setMessage(EXPORT_MESSAGES.failed)
    setState(EXPORT_STATE.ERROR)
    notifyRef.current?.({
      type: 'error',
      message: denied
        ? EXPORT_MESSAGES.permissionDenied
        : EXPORT_MESSAGES.failedShort,
    })
  }, [minLoadingMs, timeoutMs, successMs, sound])

  return {
    state,
    message,
    permissionDenied,
    trigger,
    loading: state === EXPORT_STATE.LOADING,
  }
}
