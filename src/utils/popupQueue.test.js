import { describe, expect, it } from 'vitest'
import { POPUP_ORDER, popupBlockedBy, popupToShow } from './popupQueue'
import { tourWaitReason } from './tour'

describe('popup queue order', () => {
  it('is rollout -> welcome -> tour -> daily', () => {
    expect(POPUP_ORDER).toEqual(['rollout', 'welcome', 'tour', 'daily'])
  })
  it('a popup is blocked only by EARLIER ones', () => {
    expect(popupBlockedBy('rollout', { welcome: true, daily: true })).toBe(
      false
    )
    expect(popupBlockedBy('welcome', { rollout: true })).toBe(true)
    expect(popupBlockedBy('welcome', { tour: true, daily: true })).toBe(false)
    expect(popupBlockedBy('daily', { welcome: true })).toBe(true)
    expect(popupBlockedBy('daily', { tour: true })).toBe(true)
    expect(popupBlockedBy('daily', {})).toBe(false)
  })
  it('only one shows at a time', () => {
    expect(popupToShow({ daily: true, welcome: true, tour: true })).toBe(
      'welcome'
    )
    expect(popupToShow({ daily: true, tour: true })).toBe('tour')
    expect(popupToShow({})).toBeNull()
  })
  it('the walkthrough waits for the welcome popup', () => {
    expect(tourWaitReason({ gameReady: true, welcome: true })).toBe('welcome')
    expect(tourWaitReason({ gameReady: true, welcome: false })).toBeNull()
  })
})
