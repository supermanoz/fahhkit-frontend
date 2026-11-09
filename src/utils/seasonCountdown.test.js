import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_PHASE,
  computeClockOffsetMs,
  formatCountdownText,
  formatSeasonAriaLabel,
  getCountdownPhase,
  parseSeasonDateTime,
  tickIntervalMs,
} from './seasonCountdown'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

describe('getCountdownPhase / formatCountdownText', () => {
  it('shows "SEASON ENDS: N DAYS LEFT" with more than one day left', () => {
    const remaining = 5 * DAY_MS + HOUR_MS
    expect(getCountdownPhase(remaining)).toBe(COUNTDOWN_PHASE.DAYS)
    expect(formatCountdownText(remaining)).toBe('SEASON ENDS: 5 DAYS LEFT')
  })

  // The boundary that's easy to get backwards: exactly 2 days left is still
  // "2 DAYS LEFT", not "LAST DAY" - LAST_DAY only starts once under 48h.
  it('treats exactly 48h remaining as still "2 DAYS LEFT"', () => {
    expect(formatCountdownText(2 * DAY_MS)).toBe('SEASON ENDS: 2 DAYS LEFT')
  })

  it('shows "SEASON ENDS: LAST DAY" once under 48h but still 24h or more left', () => {
    const remaining = DAY_MS + HOUR_MS
    expect(getCountdownPhase(remaining)).toBe(COUNTDOWN_PHASE.LAST_DAY)
    expect(formatCountdownText(remaining)).toBe('SEASON ENDS: LAST DAY')
  })

  it('ticks "SEASON ENDS: HH:MM:SS" (no "LEFT" suffix) once under 24h', () => {
    const remaining = 2 * HOUR_MS + 5 * 60 * 1000 + 9 * 1000
    expect(getCountdownPhase(remaining)).toBe(COUNTDOWN_PHASE.FINAL_HOURS)
    expect(formatCountdownText(remaining)).toBe('SEASON ENDS: 02:05:09')
  })

  it('pads single-digit hours/minutes/seconds', () => {
    expect(formatCountdownText(1000)).toBe('SEASON ENDS: 00:00:01')
  })

  // ENDED is the one phase whose text deliberately drops the "SEASON
  // ENDS:" prefix ("SEASON ENDS: SEASON ENDED" would be nonsense).
  it('reports bare "SEASON ENDED" (no prefix) once remaining time hits zero or goes negative', () => {
    expect(formatCountdownText(0)).toBe('SEASON ENDED')
    expect(formatCountdownText(-HOUR_MS)).toBe('SEASON ENDED')
  })

  // The brief is explicit: an unknown/failed fetch must hide the pill text,
  // never fall through to some default number.
  it('hides the pill text (returns null) when remaining time is unknown', () => {
    expect(formatCountdownText(null)).toBeNull()
    expect(formatCountdownText(undefined)).toBeNull()
    expect(formatCountdownText(NaN)).toBeNull()
    expect(getCountdownPhase(null)).toBe(COUNTDOWN_PHASE.UNKNOWN)
  })
})

describe('tickIntervalMs', () => {
  it('ticks every second only in the final 24h', () => {
    expect(tickIntervalMs(HOUR_MS)).toBe(1000)
  })

  it('ticks once a minute outside the final 24h, including when ended/unknown', () => {
    expect(tickIntervalMs(5 * DAY_MS)).toBe(60000)
    expect(tickIntervalMs(DAY_MS + HOUR_MS)).toBe(60000)
    expect(tickIntervalMs(0)).toBe(60000)
    expect(tickIntervalMs(null)).toBe(60000)
  })
})

describe('formatSeasonAriaLabel', () => {
  it('matches the spec\'s "Season ends in N days" shape', () => {
    expect(formatSeasonAriaLabel(5 * DAY_MS + HOUR_MS)).toBe(
      'Season ends in 5 days'
    )
  })

  it('singularizes "1 day"', () => {
    expect(formatSeasonAriaLabel(DAY_MS + HOUR_MS)).toBe('Season ends in 1 day')
  })

  // Mirrors the pill's own new precision under 24h (exact HH:MM:SS,
  // dropped the vaguer "under a day") rather than going stale against it.
  it('spells out exact hours/minutes/seconds remaining once under 24h', () => {
    const remaining = 2 * HOUR_MS + 5 * 60 * 1000 + 9 * 1000
    expect(formatSeasonAriaLabel(remaining)).toBe(
      'Season ends in 02 hours 05 minutes 09 seconds'
    )
  })

  it('describes the ended/unknown cases in words, not a stale number', () => {
    expect(formatSeasonAriaLabel(0)).toBe('Season has ended')
    expect(formatSeasonAriaLabel(null)).toBeNull()
  })
})

describe('parseSeasonDateTime', () => {
  it('parses a proper zoned/UTC ISO string as-is', () => {
    const ms = parseSeasonDateTime('2026-11-21T00:00:00Z')
    expect(ms).toBe(Date.parse('2026-11-21T00:00:00Z'))
  })

  it('parses an explicit-offset ISO string as-is', () => {
    const ms = parseSeasonDateTime('2026-11-21T05:45:00+05:45')
    expect(ms).toBe(Date.parse('2026-11-21T00:00:00Z'))
  })

  // The real-world shape GET /v1/season/current sends today: no "Z", no
  // offset - this is Asia/Kathmandu (UTC+5:45) wall-clock time, per
  // application.properties' spring.jackson.time-zone, not UTC.
  it('reads a naive LocalDateTime string as Asia/Kathmandu wall-clock time', () => {
    const ms = parseSeasonDateTime('2026-11-21T00:00:00')
    // 2026-11-21T00:00 in Kathmandu (UTC+5:45) is 2026-11-20T18:15 UTC.
    expect(ms).toBe(Date.parse('2026-11-20T18:15:00Z'))
  })

  it('returns null for missing or unparsable input, never 0/NaN', () => {
    expect(parseSeasonDateTime(null)).toBeNull()
    expect(parseSeasonDateTime(undefined)).toBeNull()
    expect(parseSeasonDateTime('not a date')).toBeNull()
  })
})

describe('computeClockOffsetMs', () => {
  it('returns 0 (no correction) when the backend sends no serverTime, instead of throwing', () => {
    expect(computeClockOffsetMs(undefined, Date.now())).toBe(0)
    expect(computeClockOffsetMs(null, Date.now())).toBe(0)
  })

  // The actual point of this function: a device clock that's run 2 hours
  // fast must not steal 2 hours off the displayed countdown once the
  // backend does send serverTime.
  it('derives the device clock skew from a serverTime field so a wrong device clock is corrected', () => {
    const realServerMs = Date.parse('2026-11-09T12:00:00Z')
    const fastDeviceNowMs = realServerMs + 2 * HOUR_MS
    const offset = computeClockOffsetMs('2026-11-09T12:00:00Z', fastDeviceNowMs)
    expect(offset).toBe(-2 * HOUR_MS)
    // Applying the offset back to the device clock recovers real server time.
    expect(fastDeviceNowMs + offset).toBe(realServerMs)
  })
})
