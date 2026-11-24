import { describe, expect, it } from 'vitest'
import { pickerBadgeCount, pickerTabs, visiblePlayOptions } from './playOptions'
import { SHOW_PVP_ENTRY } from '../config/features'

const all = [
  { tab: 'conquer', x: -120 },
  { tab: 'training', x: 0 },
  { tab: 'race', x: 120 },
]

describe('Play menu options', () => {
  it('PvP is shown by default (flag on)', () => {
    expect(SHOW_PVP_ENTRY).toBe(true)
  })
  it('flag on: all three, untouched', () => {
    expect(visiblePlayOptions(all, true)).toEqual(all)
  })
  it('flag off: no PvP, remaining two re-centred and evenly spaced', () => {
    const v = visiblePlayOptions(all, false)
    expect(v.map((o) => o.tab)).toEqual(['conquer', 'training'])
    expect(v.map((o) => o.x)).toEqual([-60, 60])
  })
})

describe('section drop-down', () => {
  const tabs = [
    { id: 'leaderboard' },
    { id: 'club' },
    { id: 'race' },
    { id: 'mail' },
    { id: 'me' },
  ]
  it('PvP is not a row by default (flag off); the rest keep their order', () => {
    expect(pickerTabs(tabs, false).map((t) => t.id)).toEqual([
      'leaderboard',
      'club',
      'mail',
      'me',
    ])
  })
  it('flag on: everything, untouched', () => {
    expect(pickerTabs(tabs, true)).toEqual(tabs)
  })
  it('does not mutate the input', () => {
    pickerTabs(tabs, false)
    expect(tabs).toHaveLength(5)
  })
  it('collapsed dot ignores PvP when PvP is not listed', () => {
    const base = { menuTab: 'me', pvpCount: 3, mailCount: 2 }
    expect(pickerBadgeCount({ ...base, showPvpInDropdown: false })).toBe(2)
    expect(pickerBadgeCount({ ...base, showPvpInDropdown: true })).toBe(5)
    expect(
      pickerBadgeCount({ ...base, menuTab: 'mail', showPvpInDropdown: true })
    ).toBe(3)
  })
})
