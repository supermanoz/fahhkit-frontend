import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const setBusVolume = vi.fn()
const setSfxVolume = vi.fn((v) => Math.max(0, Math.min(100, Math.round(v))))
vi.mock('../utils/audioGraph', () => ({ setBusVolume }))
vi.mock('../utils/gameSound', () => ({
  setSfxVolume: (v) => {
    const out = setSfxVolume(v)
    localStorage.setItem('fahhkit_territory_sfx_volume', String(out))
    if (out > 0)
      localStorage.setItem('fahhkit_territory_sfx_volume_last', String(out))
    return out
  },
}))

const { useAudioVolumes } = await import('./useAudioVolumes')

beforeEach(() => {
  localStorage.clear()
  setBusVolume.mockClear()
  setSfxVolume.mockClear()
})

describe('useAudioVolumes', () => {
  it('starts from defaults for a new player', () => {
    const { result } = renderHook(() => useAudioVolumes())
    expect(result.current.musicVolume).toBe(35)
    expect(result.current.sfxVolume).toBe(100)
    expect(result.current.musicMuted).toBe(false)
    expect(result.current.sfxMuted).toBe(false)
  })

  it('migrates the old off flags to 0 (muted)', () => {
    localStorage.setItem('fahhkit_territory_music_muted', 'true')
    localStorage.setItem('fahhkit_territory_sfx_muted', 'true')
    const { result } = renderHook(() => useAudioVolumes())
    expect(result.current.musicVolume).toBe(0)
    expect(result.current.sfxVolume).toBe(0)
    expect(result.current.musicMuted).toBe(true)
    expect(result.current.sfxMuted).toBe(true)
  })

  it('music: change saves immediately, applies live, and is restored next launch', () => {
    const { result } = renderHook(() => useAudioVolumes())
    act(() => result.current.changeMusic(72))
    expect(result.current.musicVolume).toBe(72)
    expect(localStorage.getItem('fahhkit_territory_music_volume')).toBe('72')
    expect(setBusVolume).toHaveBeenLastCalledWith('music', 72)
    const again = renderHook(() => useAudioVolumes())
    expect(again.result.current.musicVolume).toBe(72)
  })

  it('music: speaker mutes, then restores the level you had', () => {
    const { result } = renderHook(() => useAudioVolumes())
    act(() => result.current.changeMusic(60))
    act(() => result.current.toggleMusicMute())
    expect(result.current.musicVolume).toBe(0)
    expect(result.current.musicMuted).toBe(true)
    expect(setBusVolume).toHaveBeenLastCalledWith('music', 0)
    act(() => result.current.toggleMusicMute())
    expect(result.current.musicVolume).toBe(60)
    expect(result.current.musicMuted).toBe(false)
  })

  it('sfx: change goes through gameSound (persist + live) and mute remembers the level', () => {
    const { result } = renderHook(() => useAudioVolumes())
    act(() => result.current.changeSfx(45))
    expect(setSfxVolume).toHaveBeenLastCalledWith(45)
    expect(result.current.sfxVolume).toBe(45)
    act(() => result.current.toggleSfxMute())
    expect(result.current.sfxVolume).toBe(0)
    act(() => result.current.toggleSfxMute())
    expect(result.current.sfxVolume).toBe(45)
  })

  it('dragging a slider to 0 then tapping the speaker restores the last level', () => {
    const { result } = renderHook(() => useAudioVolumes())
    act(() => result.current.changeMusic(80))
    act(() => result.current.changeMusic(0))
    expect(result.current.musicMuted).toBe(true)
    act(() => result.current.toggleMusicMute())
    expect(result.current.musicVolume).toBe(80)
  })
})
