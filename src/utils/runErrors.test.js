import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { runErrorMessage } from './runErrors'
import { classifyError } from './runSync'

const CODES = [
  'RUN_TOO_OLD',
  'RUN_TIME_IN_FUTURE',
  'RUN_TIMES_INCONSISTENT',
  'RUN_TOO_MANY_POINTS',
  'RUN_POINT_TIMES_INVALID',
  'EMPTY_POINTS',
  'NO_ACCURATE_POINTS',
  'INVALID_RUN_MODE',
]

describe('run error messages', () => {
  it.each(CODES)('%s is plain language, never the raw code', (code) => {
    const msg = runErrorMessage(new ApiError('SERVER TEXT', 400, code))
    expect(msg).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
    expect(msg).not.toBe('SERVER TEXT')
    expect(msg.length).toBeGreaterThan(20)
  })
  it('too old mentions the 14-day limit; future time points at the phone clock', () => {
    expect(runErrorMessage(new ApiError('x', 400, 'RUN_TOO_OLD'))).toMatch(
      /14 days/
    )
    expect(
      runErrorMessage(new ApiError('x', 400, 'RUN_TIME_IN_FUTURE'))
    ).toMatch(/date and time/)
  })
  it('an unknown code keeps a normal server sentence, but never a bare code', () => {
    expect(
      runErrorMessage(new ApiError('Something odd happened.', 400, 'NEW'))
    ).toBe('Something odd happened.')
    expect(runErrorMessage(new ApiError('SOME_CODE_X', 400))).toBe(
      'The server could not accept this run.'
    )
  })
  it('the outbox classifier uses it: 400 + RUN_TOO_OLD is permanent with the friendly text', () => {
    const r = classifyError(new ApiError('too old', 400, 'RUN_TOO_OLD'))
    expect(r.kind).toBe('permanent')
    expect(r.message).toMatch(/14 days/)
  })
  it('503 busy is retried, not failed', () => {
    expect(
      classifyError(new ApiError('busy', 503, 'TEMPORARILY_BUSY')).kind
    ).toBe('retry')
  })
})
