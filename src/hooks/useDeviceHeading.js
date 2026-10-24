import { useEffect, useRef, useState } from 'react'
import { smoothAngle } from '../utils/territoryGame'

// How long to wait for a first usable reading before giving up on this
// device having a compass at all (desktop browsers, or a phone with no
// magnetometer, may expose the event but never actually fire a usable one).
const NO_SIGNAL_TIMEOUT_MS = 2500

// Below this, a change is sensor noise, not a real turn - skip the React
// commit (and so the map's rotate) entirely rather than chase it.
const COMMIT_THRESHOLD_DEG = 1.5

// iOS gates DeviceOrientationEvent behind an explicit permission prompt that
// only counts as answered when requested synchronously from inside a real
// user gesture's own call stack - call this directly inside that tap's
// click handler (awaited, but the call itself unawaited-until-then must
// still originate there), not from an effect reacting to state after the
// gesture has already finished, or Safari silently denies it. Resolves
// false on denial, on any other platform's lack of a compass API, or if
// requestPermission itself throws; true otherwise (including every browser
// that has no such gate at all - Android/desktop just subscribe directly).
export async function requestCompassPermission() {
  if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
    return false
  }
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
    return true
  }
  try {
    return (await DeviceOrientationEvent.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

// Reads the device's compass/magnetometer heading (0-360, 0 = north,
// clockwise) while `active`. The raw sensor event only ever writes a ref
// (rawRef) - the actual smoothing (smoothAngle, same low-pass filter +
// shortest-path wraparound as TerritoryMap's own travel-direction
// playerHeading) and the React commit both happen inside a
// requestAnimationFrame loop instead, so a device firing events faster
// than the screen can repaint (some phones report orientation at 60Hz+)
// doesn't turn into 60+ re-renders a second - the loop naturally caps at
// display refresh rate regardless of sensor rate, and a commit is skipped
// entirely below COMMIT_THRESHOLD_DEG so pure sensor noise never reaches
// React (or the map's rotation) at all.
//
// Prefers `deviceorientationabsolute` (Chrome/Android's event, already
// relative to true/magnetic north whenever it fires at all) and falls back
// to `deviceorientation`'s `webkitCompassHeading` (iOS Safari, likewise
// already north-relative) or its own `absolute` + alpha combo. Plain
// relative alpha with neither of those is from a device with no real
// compass reference, so it's left unused rather than feeding a heading
// that'd just drift - `unavailable` flips true instead once
// NO_SIGNAL_TIMEOUT_MS passes with nothing usable, so the caller can fall
// back out of Compass mode gracefully (point 6: no compass hardware, or
// permission denied).
export function useDeviceHeading(active) {
  const [heading, setHeading] = useState(null)
  const [unavailable, setUnavailable] = useState(false)
  const rawRef = useRef(null)
  const smoothedRef = useRef(null)
  const committedRef = useRef(null)

  useEffect(() => {
    if (!active) {
      setHeading(null)
      setUnavailable(false)
      rawRef.current = null
      smoothedRef.current = null
      committedRef.current = null
      return
    }
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
      setUnavailable(true)
      return
    }

    let gotReading = false
    let usingAbsolute = false

    function setRaw(value) {
      gotReading = true
      rawRef.current = ((value % 360) + 360) % 360
    }

    // Once a real absolute reading shows up, stop trusting the plain event
    // (some browsers fire both for the same physical event).
    function handleAbsolute(event) {
      if (event.alpha == null) return
      usingAbsolute = true
      setRaw(360 - event.alpha)
    }

    function handleOrientation(event) {
      if (usingAbsolute) return
      if (typeof event.webkitCompassHeading === 'number') {
        setRaw(event.webkitCompassHeading)
      } else if (event.absolute && event.alpha != null) {
        setRaw(360 - event.alpha)
      }
    }

    window.addEventListener('deviceorientationabsolute', handleAbsolute)
    window.addEventListener('deviceorientation', handleOrientation)
    const noSignalTimer = setTimeout(() => {
      if (!gotReading) setUnavailable(true)
    }, NO_SIGNAL_TIMEOUT_MS)

    let rafId
    function tick() {
      if (rawRef.current != null) {
        smoothedRef.current = smoothAngle(
          smoothedRef.current ?? rawRef.current,
          rawRef.current
        )
        const last = committedRef.current
        const delta =
          last == null
            ? 360
            : Math.abs(((smoothedRef.current - last + 540) % 360) - 180)
        if (delta >= COMMIT_THRESHOLD_DEG) {
          committedRef.current = smoothedRef.current
          setHeading(smoothedRef.current)
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(noSignalTimer)
      window.removeEventListener('deviceorientationabsolute', handleAbsolute)
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [active])

  return { heading, unavailable }
}
