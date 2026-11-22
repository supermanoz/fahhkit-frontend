// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

let sound
let graph
let created

function makeContext() {
  const mk = () => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
  })
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: { id: 'dest' },
    createGain: vi.fn(() => mk()),
    createOscillator: vi.fn(() => {
      const o = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      created.push(o)
      return o
    }),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(8) })),
    createBufferSource: vi.fn(() => {
      const n = { connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      created.push(n)
      return n
    }),
    createBiquadFilter: vi.fn(() => ({
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
    })),
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
    resume: vi.fn(() => Promise.resolve()),
  }
  return ctx
}

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  created = []
  const ctx = makeContext()
  window.AudioContext = vi.fn(() => ctx)
  graph = await import('./audioGraph')
  sound = await import('./gameSound')
})

describe('Sound-effects volume', () => {
  it('defaults to 100 and is not muted', () => {
    expect(sound.getSfxVolume()).toBe(100)
    expect(sound.isSfxMuted()).toBe(false)
  })

  it('setSfxVolume persists, applies to the sfx bus live and returns the value', () => {
    expect(sound.setSfxVolume(40)).toBe(40)
    expect(localStorage.getItem('fahhkit_territory_sfx_volume')).toBe('40')
    expect(graph.getBusVolume('sfx')).toBe(40)
    expect(sound.isSfxMuted()).toBe(false)
  })

  it('0 is muted: nothing is created, and what is playing is cut off', () => {
    sound.playSfx('tap')
    const playing = [...created]
    expect(playing.length).toBeGreaterThan(0)
    created.length = 0
    sound.setSfxVolume(0)
    playing.forEach((n) => expect(n.stop).toHaveBeenCalled())
    sound.playSfx('tap')
    sound.playSfx('tick')
    expect(created).toHaveLength(0)
    expect(sound.isSfxMuted()).toBe(true)
  })

  it('effects feed the sfx bus (so the slider scales them), not the destination', () => {
    sound.setSfxVolume(50)
    sound.playSfx('tick')
    const sfxBus = graph.getBus('sfx')
    const osc = created[0]
    const gainNode = osc.connect.mock.calls[0][0]
    expect(gainNode.connect).toHaveBeenCalledWith(sfxBus)
  })

  it('the old "off" flag migrates to muted', async () => {
    localStorage.setItem('fahhkit_territory_sfx_muted', 'true')
    vi.resetModules()
    window.AudioContext = vi.fn(() => makeContext())
    const fresh = await import('./gameSound')
    expect(fresh.isSfxMuted()).toBe(true)
  })
})
