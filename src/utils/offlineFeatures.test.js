import { describe, expect, it } from 'vitest'
import {
  OFFLINE_BLOCKED_PLAY,
  OFFLINE_BLOCKED_TABS,
  needsInternet,
} from './offlineFeatures'

describe('what needs internet', () => {
  it('server-backed tabs are blocked offline', () => {
    for (const t of ['leaderboard', 'club', 'shop', 'mail', 'race'])
      expect(needsInternet(t)).toBe(true)
    expect([...OFFLINE_BLOCKED_TABS].sort()).toEqual([
      'club',
      'leaderboard',
      'mail',
      'race',
      'shop',
    ])
  })
  it('recording and your own data stay available offline', () => {
    for (const t of ['me', 'settings', 'training', 'conquer'])
      expect(needsInternet(t)).toBe(false)
  })
  it('only opponent modes are blocked from starting', () => {
    expect([...OFFLINE_BLOCKED_PLAY].sort()).toEqual(['club-war', 'race'])
  })
})
