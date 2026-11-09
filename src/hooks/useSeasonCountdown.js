import { useEffect, useRef, useState } from 'react'
import { getCurrentSeason } from '../api/season'
import {
  computeClockOffsetMs,
  formatCountdownText,
  formatSeasonAriaLabel,
  parseSeasonDateTime,
  tickIntervalMs,
} from '../utils/seasonCountdown'

// Module-level, not component state - "cache for the session" (per the
// brief) means every mount of the Leaderboard tab (SponsorBannerCarousel
// unmounts/remounts with it, see GamePage.jsx) reuses one fetch instead of
// re-hitting /v1/season/current on every open, for as long as that season's
// endDate hasn't passed yet.
let cache = null // { season, endMs, clockOffsetMs }

function buildEntry(season) {
  return {
    season,
    endMs: parseSeasonDateTime(season?.endDate),
    clockOffsetMs: computeClockOffsetMs(season?.serverTime),
  }
}

// Drives the Leaderboard banner's season countdown pill: fetches
// GET /v1/season/current once per cache lifetime, then re-renders on the
// cadence formatCountdownText actually needs (1s in the final day, 60s
// otherwise - see tickIntervalMs) rather than every second regardless of
// phase. A fetch failure or a still-loading first mount both read as
// "unknown" (text: null) - the pill hides its text rather than guess, per
// the brief; they're kept distinguishable here (loading vs errored) only
// because SeasonBanner needs that to decide whether to render the pill
// shell at all while the very first fetch is in flight.
export function useSeasonCountdown() {
  const [entry, setEntry] = useState(cache)
  const [status, setStatus] = useState(cache ? 'ready' : 'loading')
  const [nowMs, setNowMs] = useState(Date.now())
  const timeoutRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    function fetchSeason() {
      setStatus((prev) => (prev === 'ready' ? prev : 'loading'))
      getCurrentSeason()
        .then((season) => {
          if (cancelled) return
          cache = buildEntry(season)
          setEntry(cache)
          setStatus('ready')
        })
        .catch(() => {
          if (cancelled) return
          setStatus('error')
        })
    }

    const stale = cache?.endMs != null && cache.endMs <= Date.now()
    if (!cache || stale) {
      fetchSeason()
    } else {
      setEntry(cache)
      setStatus('ready')
    }

    return () => {
      cancelled = true
    }
  }, [])

  const clockOffsetMs = entry?.clockOffsetMs || 0
  const msRemaining =
    entry?.endMs != null ? entry.endMs - (nowMs + clockOffsetMs) : null

  // Reschedules itself at whatever cadence the *current* phase needs
  // (crossing from "days" into "last day" into "final hours" shortens the
  // interval as it goes) instead of a fixed setInterval(1000) that would
  // burn renders for days at a time.
  useEffect(() => {
    clearTimeout(timeoutRef.current)
    if (entry?.endMs == null) return undefined
    const delay = tickIntervalMs(msRemaining)
    timeoutRef.current = setTimeout(() => setNowMs(Date.now()), delay)
    return () => clearTimeout(timeoutRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arms on every tick/entry change, msRemaining is derived from both
  }, [entry, nowMs])

  // The season rotates on the backend within ~1h of endMs (see
  // SeasonResponse's own comment) - once our local countdown reaches zero,
  // invalidate the cache so the NEXT open re-fetches instead of reusing a
  // dead season indefinitely. Guarded so it only fires the one time per
  // entry, not on every subsequent tick while still ended.
  const invalidatedRef = useRef(null)
  useEffect(() => {
    if (
      msRemaining != null &&
      msRemaining <= 0 &&
      invalidatedRef.current !== entry
    ) {
      invalidatedRef.current = entry
      if (cache === entry) cache = null
    }
  }, [entry, msRemaining])

  const text = formatCountdownText(msRemaining)
  const ariaLabel = formatSeasonAriaLabel(msRemaining)
  const localEndLabel =
    entry?.endMs != null
      ? new Date(entry.endMs).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null

  return {
    season: entry?.season || null,
    loading: status === 'loading',
    failed: status === 'error',
    text,
    ariaLabel,
    localEndLabel,
    ended: msRemaining != null && msRemaining <= 0,
  }
}
