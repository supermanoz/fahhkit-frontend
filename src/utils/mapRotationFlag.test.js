// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { MAP_ROTATION_ENABLED } from '../config/features'
import { getRotateWhileRunning } from './mapRotationSetting'

// The heading-up map rotation is switched off by one flag. With it off a
// stored "on" value must be ignored (the map stays north-up).
describe('map rotation feature flag', () => {
  beforeEach(() => localStorage.clear())

  it('is off by default', () => {
    expect(MAP_ROTATION_ENABLED).toBe(false)
  })

  it('ignores a stored "rotate while running = on" while the flag is off', () => {
    localStorage.setItem('fahhkit_map_rotate_while_running', 'true')
    expect(getRotateWhileRunning()).toBe(false)
  })
})
