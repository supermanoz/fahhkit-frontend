import { useCallback, useEffect, useRef, useState } from 'react'
import { useWakeLock } from './useWakeLock'
import { newClientRunId } from '../utils/clientRunId'
import {
  DEFAULT_STRIDE_M,
  estimateIndoorDistance,
  indoorElapsedSeconds,
  validateIndoorRun,
} from '../utils/indoorRun'
import {
  getPedometerStatus,
  readPedometer,
  startPedometer,
  stopPedometer,
} from '../utils/pedometer'
import { chooseStepsSource, STEPS_SOURCE } from '../utils/stepsSource'

// Indoor (treadmill) Training. No GPS, no map: an epoch-based clock, the
// pedometer's steps, and an estimated distance the player corrects on the
// confirm screen. State is persisted on every change, so backgrounding the app
// or killing it loses nothing - the timer is just "now - startedAt - pauses".
//
//   idle -> running <-> paused -> confirm -> (finish: a pending-run record) / (discard)

export const INDOOR_STORAGE_KEY = 'fahhkit_indoor_run_v1'

function load() {
  try {
    const raw = localStorage.getItem(INDOOR_STORAGE_KEY)
    const rec = raw ? JSON.parse(raw) : null
    return rec && Number.isFinite(rec.startedAtMs) && rec.status ? rec : null
  } catch {
    return null
  }
}
function save(rec) {
  try {
    if (rec) localStorage.setItem(INDOOR_STORAGE_KEY, JSON.stringify(rec))
    else localStorage.removeItem(INDOOR_STORAGE_KEY)
  } catch {
    // storage full/unavailable - the run still works in memory
  }
}

export function useIndoorRun({
  strideM = DEFAULT_STRIDE_M,
  now = Date.now,
} = {}) {
  const [rec, setRec] = useState(load)
  const recRef = useRef(rec)
  recRef.current = rec
  const [tick, setTick] = useState(0)
  // Latest pedometer reading since the run began (cumulative, pauses included).
  const [reading, setReading] = useState({ steps: null, distanceMeters: null })
  const [pedStatus, setPedStatus] = useState({
    available: false,
    permission: 'unavailable',
  })
  const wakeLock = useWakeLock()

  const commit = useCallback((next) => {
    recRef.current = next
    setRec(next)
    save(next)
  }, [])

  const refreshReading = useCallback(async () => {
    const r = recRef.current
    if (!r) return null
    const res = await readPedometer(r.startedAtMs)
    if (res && res.steps != null) {
      setReading({ steps: res.steps, distanceMeters: res.distanceMeters })
      return res
    }
    return null
  }, [])

  // Pedometer lifecycle: counting runs for as long as there is an indoor run
  // (also after a reload - the ORIGINAL start time is passed again).
  const status = rec?.status ?? 'idle'
  const startedAtMs = rec?.startedAtMs
  const inConfirm = status === 'confirm'
  useEffect(() => {
    if (!startedAtMs) return undefined
    let cancelled = false
    getPedometerStatus().then((st) => {
      if (!cancelled) setPedStatus(st)
    })
    return () => {
      cancelled = true
    }
  }, [startedAtMs])

  const canCount =
    pedStatus.available && pedStatus.permission === 'granted' && !inConfirm
  useEffect(() => {
    if (!startedAtMs || !canCount) return undefined
    let cancelled = false
    ;(async () => {
      await startPedometer(startedAtMs, (r) => {
        if (r?.steps != null)
          setReading({
            steps: r.steps,
            distanceMeters: r.distanceMeters ?? null,
          })
      })
      if (!cancelled) refreshReading()
    })()
    return () => {
      cancelled = true
    }
  }, [startedAtMs, canCount, refreshReading])

  // Clock + screen-awake while the run is on screen.
  useEffect(() => {
    if (status !== 'running' && status !== 'paused') return undefined
    wakeLock.request()
    const id = setInterval(() => setTick((n) => n + 1), 500)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setTick((n) => n + 1)
        refreshReading()
        wakeLock.request()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      wakeLock.release()
    }
  }, [status, wakeLock, refreshReading])

  // Steps with the paused stretches taken out (the pedometer keeps counting
  // through a pause; the run must not).
  const stepsNow = useCallback(
    (r = rec, rd = reading) => {
      if (!r || rd.steps == null) return null
      const total = rd.steps - (r.pausedSteps || 0)
      return total >= 0 ? total : null
    },
    [rec, reading]
  )

  const start = useCallback(async () => {
    if (recRef.current) return
    const t = now()
    setReading({ steps: null, distanceMeters: null })
    commit({
      status: 'running',
      startedAtMs: t,
      pausedMs: 0,
      pausedAtMs: null,
      pausedSteps: 0,
      stepsAtPause: null,
      clientRunId: newClientRunId(),
    })
  }, [commit, now])

  const pause = useCallback(async () => {
    const r = recRef.current
    if (!r || r.status !== 'running') return
    const res = await refreshReading()
    commit({
      ...r,
      status: 'paused',
      pausedAtMs: now(),
      stepsAtPause: res?.steps ?? null,
    })
  }, [commit, now, refreshReading])

  const resume = useCallback(async () => {
    const r = recRef.current
    if (!r || r.status !== 'paused') return
    const res = await refreshReading()
    const t = now()
    const gained =
      res?.steps != null && r.stepsAtPause != null
        ? Math.max(0, res.steps - r.stepsAtPause)
        : 0
    commit({
      ...r,
      status: 'running',
      pausedMs: (r.pausedMs || 0) + (t - (r.pausedAtMs ?? t)),
      pausedAtMs: null,
      pausedSteps: (r.pausedSteps || 0) + gained,
      stepsAtPause: null,
    })
  }, [commit, now, refreshReading])

  // End -> freeze the clock, take the final pedometer reading, open the
  // confirm screen (distance can still be edited there).
  const end = useCallback(async () => {
    const r = recRef.current
    if (!r || (r.status !== 'running' && r.status !== 'paused')) return
    const t = now()
    const res = await refreshReading()
    // Ending while paused: the pause's own steps are not part of the run.
    const pausedGain =
      r.status === 'paused' && res?.steps != null && r.stepsAtPause != null
        ? Math.max(0, res.steps - r.stepsAtPause)
        : 0
    commit({
      ...r,
      status: 'confirm',
      endedAtMs: r.pausedAtMs ?? t,
      pausedAtMs: null,
      stepsAtPause: null,
      pausedSteps: (r.pausedSteps || 0) + pausedGain,
      stepsFinal: res?.steps ?? reading.steps,
      distanceFinal: res?.distanceMeters ?? reading.distanceMeters,
      confirmedAtMs: t,
    })
    stopPedometer()
  }, [commit, now, reading, refreshReading])

  // "Back" from the confirm screen: the time spent on the confirm screen is
  // not moving time - counting restarts where it stopped.
  const resumeFromConfirm = useCallback(() => {
    const r = recRef.current
    if (!r || r.status !== 'confirm') return
    const t = now()
    const next = {
      ...r,
      status: 'running',
      pausedMs: (r.pausedMs || 0) + Math.max(0, t - (r.endedAtMs ?? t)),
      pausedAtMs: null,
    }
    delete next.endedAtMs
    delete next.stepsFinal
    delete next.distanceFinal
    delete next.confirmedAtMs
    commit(next)
  }, [commit, now])

  const discard = useCallback(() => {
    stopPedometer()
    setReading({ steps: null, distanceMeters: null })
    commit(null)
  }, [commit])

  // Confirm screen numbers (also usable live).
  const nowMs = now()
  const durationSeconds = rec ? indoorElapsedSeconds(rec, nowMs) : 0
  void tick // re-render driver
  const rawSteps =
    status === 'confirm'
      ? rec.stepsFinal != null
        ? Math.max(0, rec.stepsFinal - (rec.pausedSteps || 0))
        : null
      : stepsNow()
  const pedMeters =
    status === 'confirm' ? rec?.distanceFinal : reading.distanceMeters
  const pedSelection = chooseStepsSource({
    pedometer: {
      available: pedStatus.available,
      permission: pedStatus.permission,
      steps: rawSteps,
    },
    // Indoor has no accelerometer fallback: a phone on a treadmill console
    // would count the belt's vibration, not the runner's steps.
    accelerometer: { available: false },
  })
  const steps = pedSelection.steps
  const stepsSource = pedSelection.source
  const estimate = estimateIndoorDistance({
    steps: stepsSource === STEPS_SOURCE.PEDOMETER ? steps : null,
    pedometerMeters: stepsSource === STEPS_SOURCE.PEDOMETER ? pedMeters : null,
    strideM,
  })

  // Builds the pending-run record the normal submit path takes (the same shape
  // useRunTracker.stop() returns), or the validation errors.
  const finish = useCallback(
    (distanceMeters) => {
      const r = recRef.current
      if (!r || r.status !== 'confirm') return { ok: false, errors: [] }
      const duration = indoorElapsedSeconds(r, nowMs)
      const verdict = validateIndoorRun({
        distanceMeters,
        durationSeconds: duration,
        steps,
      })
      if (!verdict.ok) return verdict
      const distanceSource =
        estimate && Math.abs(estimate.meters - distanceMeters) < 5
          ? estimate.source
          : 'manual'
      return {
        ...verdict,
        run: {
          eventId: null,
          clientRunId: r.clientRunId,
          challengeId: null,
          clubWarId: null,
          isTraining: true,
          isIndoor: true,
          points: [],
          distance: Math.round(distanceMeters),
          duration,
          startedAt: new Date(r.startedAtMs),
          endedAt: new Date(r.confirmedAtMs ?? r.endedAtMs),
          fixCount: 0,
          lowAccuracyFixCount: 0,
          lastAccuracy: null,
          segments: [],
          vehicleExcludedMeters: 0,
          vehicleSuspiciousRatio: 0,
          isVehicleInvalid: false,
          maxSpeedMps: null,
          avgSpeedMps: null,
          stepCount: verdict.stepsUsed,
          stepsSource: verdict.stepsUsed != null ? stepsSource : null,
          distanceSource,
          disputes: [],
        },
      }
    },
    [estimate, nowMs, steps, stepsSource]
  )

  // After the run was handed to the submit flow: forget the draft.
  const clear = useCallback(() => {
    stopPedometer()
    commit(null)
  }, [commit])

  return {
    status,
    active: status !== 'idle',
    paused: status === 'paused',
    durationSeconds,
    steps,
    stepsSource,
    pedometerStatus: pedStatus,
    estimate,
    startedAtMs,
    start,
    pause,
    resume,
    end,
    resumeFromConfirm,
    discard,
    finish,
    clear,
  }
}
