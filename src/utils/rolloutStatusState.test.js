import { describe, expect, it } from 'vitest'
import {
  PHASE,
  initialRolloutState,
  rolloutStatusReducer,
  shouldShowRolloutModal,
  shouldShowRolloutChip,
} from './rolloutStatusState'

describe('rolloutStatusReducer', () => {
  it('starts idle, nothing shown', () => {
    expect(initialRolloutState.phase).toBe(PHASE.IDLE)
    expect(shouldShowRolloutModal(initialRolloutState)).toBe(false)
    expect(shouldShowRolloutChip(initialRolloutState)).toBe(false)
  })

  it('rolled out -> nothing (no modal, no chip)', () => {
    const checking = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_START',
    })
    expect(checking.phase).toBe(PHASE.CHECKING)
    const next = rolloutStatusReducer(checking, {
      type: 'CHECK_SUCCESS',
      rolledOut: true,
    })
    expect(next.phase).toBe(PHASE.ROLLED_OUT)
    expect(shouldShowRolloutModal(next)).toBe(false)
    expect(shouldShowRolloutChip(next)).toBe(false)
  })

  it('not rolled out, not yet requested -> shows the popup', () => {
    const next = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_SUCCESS',
      rolledOut: false,
      alreadyRequested: false,
      cityName: 'Pokhara',
      countryName: 'Nepal',
      requestCount: 214,
    })
    expect(next.phase).toBe(PHASE.NEEDS_REQUEST)
    expect(next.cityName).toBe('Pokhara')
    expect(next.requestCount).toBe(214)
    expect(shouldShowRolloutModal(next)).toBe(true)
    expect(shouldShowRolloutChip(next)).toBe(false)
  })

  it('already requested -> no popup, shows the chip instead', () => {
    const next = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_SUCCESS',
      rolledOut: false,
      alreadyRequested: true,
      cityName: 'Pokhara',
      countryName: 'Nepal',
      requestCount: 215,
    })
    expect(next.phase).toBe(PHASE.ALREADY_REQUESTED)
    expect(shouldShowRolloutModal(next)).toBe(false)
    expect(shouldShowRolloutChip(next)).toBe(true)
  })

  it('check failed (offline/error) -> nothing, fails open', () => {
    const next = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_FAILED',
    })
    expect(next.phase).toBe(PHASE.FAILED)
    expect(shouldShowRolloutModal(next)).toBe(false)
    expect(shouldShowRolloutChip(next)).toBe(false)
  })

  it('"Maybe Later"/close dismisses the modal for this state instance only', () => {
    const needsRequest = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_SUCCESS',
      rolledOut: false,
      alreadyRequested: false,
      cityName: 'Pokhara',
      countryName: 'Nepal',
    })
    const dismissed = rolloutStatusReducer(needsRequest, { type: 'DISMISS' })
    expect(shouldShowRolloutModal(dismissed)).toBe(false)
    // Still "needs request" underneath - a chip-worthy check would still see it,
    // it's only the proactive modal that's suppressed.
    expect(dismissed.phase).toBe(PHASE.NEEDS_REQUEST)
  })

  it('DISMISS is a no-op outside the needsRequest phase', () => {
    const rolledOut = { ...initialRolloutState, phase: PHASE.ROLLED_OUT }
    expect(rolloutStatusReducer(rolledOut, { type: 'DISMISS' })).toBe(rolledOut)
  })

  it('requesting rollout: start -> submitting, success -> justRequested with the new count', () => {
    const needsRequest = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_SUCCESS',
      rolledOut: false,
      alreadyRequested: false,
      cityName: 'Pokhara',
      countryName: 'Nepal',
      requestCount: 214,
    })
    const submitting = rolloutStatusReducer(needsRequest, {
      type: 'REQUEST_START',
    })
    expect(submitting.submitting).toBe(true)
    const sent = rolloutStatusReducer(submitting, {
      type: 'REQUEST_SUCCESS',
      requestCount: 215,
    })
    expect(sent.submitting).toBe(false)
    expect(sent.justRequested).toBe(true)
    expect(sent.requestCount).toBe(215)
  })

  it('requesting rollout that turns out already rolled out -> same good-news state as a rolled-out check', () => {
    const needsRequest = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_SUCCESS',
      rolledOut: false,
      alreadyRequested: false,
      cityName: 'Pokhara',
      countryName: 'Nepal',
    })
    const next = rolloutStatusReducer(needsRequest, {
      type: 'REQUEST_ALREADY_ROLLED_OUT',
    })
    expect(next.phase).toBe(PHASE.ROLLED_OUT)
  })

  it('a failed request keeps the modal open with a retryable error, not stuck submitting', () => {
    const needsRequest = rolloutStatusReducer(initialRolloutState, {
      type: 'CHECK_SUCCESS',
      rolledOut: false,
      alreadyRequested: false,
    })
    const submitting = rolloutStatusReducer(needsRequest, {
      type: 'REQUEST_START',
    })
    const failed = rolloutStatusReducer(submitting, {
      type: 'REQUEST_FAILED',
      message: 'Could not reach the server.',
    })
    expect(failed.submitting).toBe(false)
    expect(failed.submitError).toBe('Could not reach the server.')
    expect(shouldShowRolloutModal(failed)).toBe(true)
  })

  it('an unknown action is a no-op', () => {
    expect(
      rolloutStatusReducer(initialRolloutState, { type: 'NOT_REAL' })
    ).toBe(initialRolloutState)
  })
})
