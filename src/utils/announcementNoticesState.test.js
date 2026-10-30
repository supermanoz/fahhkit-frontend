import { describe, expect, it } from 'vitest'
import {
  PHASE,
  initialAnnouncementState,
  announcementNoticesReducer,
  currentNotice,
  hasMoreNotices,
} from './announcementNoticesState'

const notice = (id, overrides = {}) => ({
  id,
  title: `Notice ${id}`,
  body: 'body',
  ...overrides,
})

describe('announcementNoticesReducer', () => {
  it('starts idle with nothing to show', () => {
    expect(initialAnnouncementState.phase).toBe(PHASE.IDLE)
    expect(currentNotice(initialAnnouncementState)).toBeNull()
  })

  it('CHECK_START moves to loading', () => {
    const state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_START',
    })
    expect(state.phase).toBe(PHASE.LOADING)
    expect(currentNotice(state)).toBeNull()
  })

  it('CHECK_SUCCESS with a pending notice shows it', () => {
    const state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [notice('a')],
    })
    expect(state.phase).toBe(PHASE.READY)
    expect(currentNotice(state)).toEqual(notice('a'))
    expect(hasMoreNotices(state)).toBe(false)
  })

  it('CHECK_SUCCESS with no pending notices shows nothing', () => {
    const state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [],
    })
    expect(state.phase).toBe(PHASE.READY)
    expect(currentNotice(state)).toBeNull()
  })

  it('CHECK_FAILED shows nothing and fails closed', () => {
    const state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_FAILED',
    })
    expect(state.phase).toBe(PHASE.FAILED)
    expect(currentNotice(state)).toBeNull()
  })

  it('DISMISS_CURRENT advances the queue', () => {
    let state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [notice('a'), notice('b')],
    })
    expect(hasMoreNotices(state)).toBe(true)
    state = announcementNoticesReducer(state, { type: 'DISMISS_CURRENT' })
    expect(currentNotice(state)).toEqual(notice('b'))
    expect(hasMoreNotices(state)).toBe(false)
  })

  it('DISMISS_CURRENT on an empty queue is a no-op', () => {
    const ready = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [],
    })
    const state = announcementNoticesReducer(ready, {
      type: 'DISMISS_CURRENT',
    })
    expect(state).toBe(ready)
  })

  it('RECEIVE appends a live-pushed notice once ready', () => {
    let state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [notice('a')],
    })
    state = announcementNoticesReducer(state, {
      type: 'RECEIVE',
      notice: notice('b'),
    })
    expect(state.queue.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('RECEIVE ignores a duplicate id already queued', () => {
    let state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [notice('a')],
    })
    state = announcementNoticesReducer(state, {
      type: 'RECEIVE',
      notice: notice('a'),
    })
    expect(state.queue).toHaveLength(1)
  })

  it('RECEIVE before the initial check has resolved is ignored (the check will include it)', () => {
    const state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'RECEIVE',
      notice: notice('a'),
    })
    expect(state).toBe(initialAnnouncementState)
  })

  // Scenarios named after the user's own test list - each one is really
  // "the server didn't return this id", since persistence lives in the
  // backend (BroadcastMailReadState), not here. The hook/integration layer
  // is what actually calls the ack endpoint and re-fetches.
  it('dismiss -> reload -> not shown (server excludes an acknowledged notice from the next check)', () => {
    let state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [notice('a')],
    })
    state = announcementNoticesReducer(state, { type: 'DISMISS_CURRENT' })
    expect(currentNotice(state)).toBeNull()
    // Simulate a fresh mount re-checking after reload/logout-login/another
    // device - the backend no longer returns 'a'.
    const freshState = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [],
    })
    expect(currentNotice(freshState)).toBeNull()
  })

  it('a genuinely new announcement still shows once', () => {
    const state = announcementNoticesReducer(initialAnnouncementState, {
      type: 'CHECK_SUCCESS',
      notices: [notice('new-one')],
    })
    expect(currentNotice(state)).toEqual(notice('new-one'))
  })
})
