import { describe, it, expect } from 'vitest'
import {
  routeForPush,
  resolvePendingTap,
  foregroundToastText,
} from './pushRouting'

describe('routeForPush', () => {
  it('opens the mailbox for a broadcast', () => {
    expect(routeForPush({ type: 'BROADCAST', broadcastId: 'b1' })).toEqual({
      tab: 'mail',
    })
  })
  it('opens the club panel for every club war event', () => {
    for (const event of ['MATCHED', 'STARTED', 'ENDING_SOON']) {
      expect(routeForPush({ type: 'CLUB_WAR', event, warId: 'w1' })).toEqual({
        tab: 'club',
      })
    }
  })
  it('shows the map for a territory attack', () => {
    expect(routeForPush({ type: 'TERRITORY_ATTACK', eventId: 'e1' })).toEqual({
      map: true,
    })
  })
  it('ignores unknown or missing payloads', () => {
    expect(routeForPush({ type: 'SOMETHING_NEW' })).toBeNull()
    expect(routeForPush(undefined)).toBeNull()
    expect(routeForPush(null)).toBeNull()
  })
})

describe('resolvePendingTap (cold start)', () => {
  const tap = { type: 'CLUB_WAR', event: 'STARTED', warId: 'w1' }
  it('waits while logged out', () => {
    expect(
      resolvePendingTap(tap, { isAuthed: false, gameReady: false })
    ).toBeNull()
  })
  it('waits for the game to finish loading after login', () => {
    expect(
      resolvePendingTap(tap, { isAuthed: true, gameReady: false })
    ).toBeNull()
  })
  it('routes once logged in and the game is ready', () => {
    expect(resolvePendingTap(tap, { isAuthed: true, gameReady: true })).toEqual(
      { tab: 'club' }
    )
  })
  it('does nothing without a pending tap', () => {
    expect(resolvePendingTap(null, { isAuthed: true, gameReady: true })).toBe(
      null
    )
  })
  it.each([
    [{ type: 'BROADCAST' }, { tab: 'mail' }],
    [{ type: 'TERRITORY_ATTACK' }, { map: true }],
  ])('routes %o after the game is ready', (data, expected) => {
    expect(
      resolvePendingTap(data, { isAuthed: true, gameReady: true })
    ).toEqual(expected)
  })
})

describe('foregroundToastText', () => {
  it('joins title and body', () => {
    expect(foregroundToastText({ title: 'War!', body: 'Run now' })).toBe(
      'War! — Run now'
    )
  })
  it('falls back to whichever exists, else null', () => {
    expect(foregroundToastText({ title: 'Only title' })).toBe('Only title')
    expect(foregroundToastText({ body: 'Only body' })).toBe('Only body')
    expect(foregroundToastText({})).toBeNull()
  })
})

import { routeForPush as _route } from './pushRouting'
import { it as _it, expect as _expect } from 'vitest'
_it('a push that names a mail opens the inbox', () => {
  _expect(_route({ type: 'MAIL' })).toEqual({ tab: 'mail' })
  _expect(_route({ type: 'PVP_RESULT', mailId: 'm1' })).toEqual({ tab: 'mail' })
  _expect(_route({ type: 'WHO_KNOWS' })).toBeNull()
})
