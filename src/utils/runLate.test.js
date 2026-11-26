import { describe, expect, it } from 'vitest'
import {
  LATE_TERRITORY_COPY,
  LATE_TERRITORY_HOURS,
  hoursLeftForTerritory,
  isLateForTerritory,
  runAgeHours,
} from './runLate'

const NOW = Date.parse('2026-03-10T12:00:00Z')
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString()

describe('late territory rule (48 h)', () => {
  it('a run under 48 h old can still claim territory', () => {
    expect(isLateForTerritory(ago(47.9), NOW)).toBe(false)
    expect(Math.round(hoursLeftForTerritory(ago(40), NOW))).toBe(8)
  })
  it('48 h or older cannot (matches the server: >= late-max-age-hours)', () => {
    expect(isLateForTerritory(ago(LATE_TERRITORY_HOURS), NOW)).toBe(true)
    expect(isLateForTerritory(ago(100), NOW)).toBe(true)
    expect(hoursLeftForTerritory(ago(100), NOW)).toBe(0)
  })
  it('a bad date or a future end time is never "late"', () => {
    expect(runAgeHours('nope', NOW)).toBe(0)
    expect(isLateForTerritory('nope', NOW)).toBe(false)
    expect(isLateForTerritory(ago(-5), NOW)).toBe(false)
  })
  it('the message tells the player territory will not count, in plain words', () => {
    expect(LATE_TERRITORY_COPY.message).toMatch(/can't claim territory/)
    expect(LATE_TERRITORY_COPY.message).toMatch(/XP/)
    expect(LATE_TERRITORY_COPY.message).not.toMatch(/LATE_NO_TERRITORY/)
  })
})
