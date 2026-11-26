import { describe, expect, it } from 'vitest'
import {
  STEPS_SOURCE,
  chooseStepsSource,
  stepsLookCarried,
} from './stepsSource'

const ped = (o = {}) => ({
  available: true,
  permission: 'granted',
  steps: 1200,
  ...o,
})
const acc = (o = {}) => ({ available: true, steps: 900, lost: false, ...o })

describe('chooseStepsSource', () => {
  it('prefers the pedometer over the accelerometer when allowed', () => {
    expect(
      chooseStepsSource({ pedometer: ped(), accelerometer: acc() })
    ).toEqual({ source: STEPS_SOURCE.PEDOMETER, steps: 1200 })
  })
  it('permission denied -> falls back to the accelerometer count', () => {
    expect(
      chooseStepsSource({
        pedometer: ped({ permission: 'denied' }),
        accelerometer: acc(),
      })
    ).toEqual({ source: STEPS_SOURCE.ACCELEROMETER, steps: 900 })
  })
  it.each(['denied', 'restricted', 'prompt', 'unavailable'])(
    'pedometer %s + no accelerometer -> no steps at all (never a fake 0)',
    (permission) => {
      expect(
        chooseStepsSource({
          pedometer: ped({ permission }),
          accelerometer: { available: false },
        })
      ).toEqual({ source: STEPS_SOURCE.NONE, steps: null })
    }
  )
  it('pedometer not available (e.g. web) -> accelerometer', () => {
    expect(
      chooseStepsSource({
        pedometer: ped({ available: false }),
        accelerometer: acc(),
      }).source
    ).toBe(STEPS_SOURCE.ACCELEROMETER)
  })
  it('an accelerometer count lost to an app kill is not used', () => {
    expect(
      chooseStepsSource({
        pedometer: ped({ permission: 'denied' }),
        accelerometer: acc({ lost: true }),
      })
    ).toEqual({ source: STEPS_SOURCE.NONE, steps: null })
  })
  it('an accelerometer that counted nothing gives no steps', () => {
    expect(
      chooseStepsSource({
        pedometer: ped({ available: false }),
        accelerometer: acc({ steps: 0 }),
      }).steps
    ).toBeNull()
  })
  it('a granted pedometer with no reading yet falls back, not to 0', () => {
    expect(
      chooseStepsSource({
        pedometer: ped({ steps: null }),
        accelerometer: acc(),
      }).source
    ).toBe(STEPS_SOURCE.ACCELEROMETER)
  })
  it('no input at all -> none', () => {
    expect(chooseStepsSource()).toEqual({ source: 'none', steps: null })
  })
})

describe('stepsLookCarried', () => {
  it('a phone carried on a run counts 60-240 steps/min', () => {
    expect(stepsLookCarried(1500, 600)).toBe(true) // 150 spm
  })
  it('a phone left on the treadmill console counts almost nothing', () => {
    expect(stepsLookCarried(40, 1800)).toBe(false)
  })
  it('more than a human gait is ignored too', () => {
    expect(stepsLookCarried(5000, 600)).toBe(false)
  })
  it('missing / zero inputs are not "carried"', () => {
    expect(stepsLookCarried(null, 600)).toBe(false)
    expect(stepsLookCarried(0, 600)).toBe(false)
    expect(stepsLookCarried(100, 0)).toBe(false)
  })
})
