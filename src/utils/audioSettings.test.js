// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_VOLUME,
  MUSIC_MUTED_KEY,
  MUSIC_VOLUME_KEY,
  SFX_MUTED_KEY,
  SFX_VOLUME_KEY,
  clampVolume,
  readLastAudible,
  readVolume,
  saveVolume,
  toggledVolume,
  volumeLevel,
} from './audioSettings'

beforeEach(() => localStorage.clear())

describe('clampVolume', () => {
  it('rounds and keeps 0-100', () => {
    expect(clampVolume(42.6)).toBe(43)
    expect(clampVolume(-5)).toBe(0)
    expect(clampVolume(250)).toBe(100)
    expect(clampVolume('abc')).toBe(0)
    expect(clampVolume(undefined)).toBe(0)
  })
})

describe('migration from the old on/off flags', () => {
  it('fresh install: defaults (music 35 = the old fixed volume, sound 100)', () => {
    expect(readVolume('music')).toBe(DEFAULT_VOLUME.music)
    expect(readVolume('sfx')).toBe(DEFAULT_VOLUME.sfx)
    expect(DEFAULT_VOLUME).toEqual({ music: 35, sfx: 100 })
  })

  it('old "on" (false / missing) = the previous default level', () => {
    localStorage.setItem(MUSIC_MUTED_KEY, 'false')
    localStorage.setItem(SFX_MUTED_KEY, 'false')
    expect(readVolume('music')).toBe(35)
    expect(readVolume('sfx')).toBe(100)
  })

  it('old "off" (true) = 0, and un-muting later restores the default', () => {
    localStorage.setItem(MUSIC_MUTED_KEY, 'true')
    localStorage.setItem(SFX_MUTED_KEY, 'true')
    expect(readVolume('music')).toBe(0)
    expect(readVolume('sfx')).toBe(0)
    expect(toggledVolume('music', 0)).toBe(35)
    expect(toggledVolume('sfx', 0)).toBe(100)
  })

  it('reading never rewrites or deletes the old keys', () => {
    localStorage.setItem(MUSIC_MUTED_KEY, 'true')
    readVolume('music')
    expect(localStorage.getItem(MUSIC_MUTED_KEY)).toBe('true')
    expect(localStorage.getItem(MUSIC_VOLUME_KEY)).toBeNull()
  })

  it('a saved volume wins over the old flag', () => {
    localStorage.setItem(MUSIC_MUTED_KEY, 'true')
    saveVolume('music', 60)
    expect(readVolume('music')).toBe(60)
  })
})

describe('persistence', () => {
  it('saves immediately and restores on the next read', () => {
    expect(saveVolume('music', 72)).toBe(72)
    expect(localStorage.getItem(MUSIC_VOLUME_KEY)).toBe('72')
    expect(readVolume('music')).toBe(72)
    saveVolume('sfx', 0)
    expect(localStorage.getItem(SFX_VOLUME_KEY)).toBe('0')
    expect(readVolume('sfx')).toBe(0) // 0 is a real saved value, not "unset"
  })

  it('ignores garbage in storage', () => {
    localStorage.setItem(MUSIC_VOLUME_KEY, 'loud')
    expect(readVolume('music')).toBe(35)
    localStorage.setItem(MUSIC_VOLUME_KEY, '')
    expect(readVolume('music')).toBe(35)
  })
})

describe('mute memory', () => {
  it('mute -> 0, unmute -> the level you had', () => {
    saveVolume('music', 80)
    expect(toggledVolume('music', 80)).toBe(0)
    saveVolume('music', 0)
    expect(readLastAudible('music')).toBe(80)
    expect(toggledVolume('music', 0)).toBe(80)
  })

  it('dragging to 0 also remembers where it was', () => {
    saveVolume('sfx', 55)
    saveVolume('sfx', 0)
    expect(toggledVolume('sfx', 0)).toBe(55)
  })

  it('survives a restart (it is stored)', () => {
    saveVolume('music', 64)
    toggledVolume('music', 64)
    saveVolume('music', 0)
    expect(readLastAudible('music')).toBe(64)
  })

  it('channels are independent', () => {
    saveVolume('music', 10)
    saveVolume('sfx', 90)
    expect(readLastAudible('music')).toBe(10)
    expect(readLastAudible('sfx')).toBe(90)
  })
})

describe('volumeLevel (speaker glyph)', () => {
  it('muted / low / high', () => {
    expect(volumeLevel(0)).toBe('muted')
    expect(volumeLevel(1)).toBe('low')
    expect(volumeLevel(49)).toBe('low')
    expect(volumeLevel(50)).toBe('high')
    expect(volumeLevel(100)).toBe('high')
  })
})
