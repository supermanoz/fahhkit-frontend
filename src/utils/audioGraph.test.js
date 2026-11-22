// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A minimal Web Audio fake that records the wiring.
function makeContext() {
  const nodes = []
  const mkGain = () => {
    const n = {
      kind: 'gain',
      gain: {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn(function (v) {
          this.value = v
        }),
      },
      connections: [],
      connect(to) {
        n.connections.push(to)
      },
    }
    nodes.push(n)
    return n
  }
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    destination: { kind: 'destination' },
    nodes,
    sources: [],
    createGain: vi.fn(mkGain),
    createMediaElementSource: vi.fn((el) => {
      const n = {
        kind: 'source',
        el,
        connections: [],
        connect(to) {
          n.connections.push(to)
        },
      }
      ctx.sources.push(n)
      return n
    }),
    resume: vi.fn(() => {
      ctx.state = 'running'
      return Promise.resolve()
    }),
  }
  return ctx
}

let graph
let ctx

async function load({ withContext = true } = {}) {
  vi.resetModules()
  ctx = makeContext()
  if (withContext) window.AudioContext = vi.fn(() => ctx)
  else delete window.AudioContext
  delete window.webkitAudioContext
  graph = await import('./audioGraph')
}

beforeEach(() => localStorage.clear())

describe('routeElement (Web Audio path)', () => {
  it('element -> its own gain -> the bus -> destination, element volume 1', async () => {
    await load()
    const audio = new Audio()
    audio.volume = 0.35
    expect(graph.routeElement(audio, 'music', 1)).toBe(true)
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(audio)
    const bus = graph.getBus('music')
    const src = ctx.sources[0]
    const elementGain = src.connections[0]
    expect(elementGain.kind).toBe('gain')
    expect(elementGain.connections).toContain(bus)
    expect(bus.connections).toContain(ctx.destination)
    expect(audio.volume).toBe(1) // iOS ignores it; the gain nodes set the level
  })

  it('is idempotent: one source per element (no double playback)', async () => {
    await load()
    const audio = new Audio()
    graph.routeElement(audio, 'music')
    graph.routeElement(audio, 'music')
    graph.routeElement(audio, 'music')
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1)
  })

  it('keeps the element looping (loop points untouched)', async () => {
    await load()
    const audio = new Audio()
    audio.loop = true
    graph.routeElement(audio, 'music')
    expect(audio.loop).toBe(true)
  })

  it("applies the element's own base level (menu pop = 0.5)", async () => {
    await load()
    const audio = new Audio()
    graph.routeElement(audio, 'sfx', 0.5)
    expect(ctx.sources[0].connections[0].gain.value).toBe(0.5)
  })
})

describe('bus volume', () => {
  it('starts at the saved level, not at full', async () => {
    localStorage.setItem('fahhkit_territory_music_volume', '20')
    await load()
    expect(graph.getBus('music').gain.value).toBeCloseTo(0.2)
    expect(graph.getBus('sfx').gain.value).toBe(1)
  })

  it('setBusVolume changes the live gain, smoothly', async () => {
    await load()
    const bus = graph.getBus('music')
    graph.setBusVolume('music', 70)
    expect(bus.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, 0, 0.015)
    expect(bus.gain.value).toBeCloseTo(0.7)
    graph.setBusVolume('music', 0)
    expect(bus.gain.value).toBe(0)
  })

  it('music and sfx are separate buses', async () => {
    await load()
    graph.setBusVolume('music', 10)
    expect(graph.getBus('sfx').gain.value).toBe(1)
    expect(graph.getBusVolume('music')).toBe(10)
  })

  it('clamps', async () => {
    await load()
    graph.setBusVolume('music', 999)
    expect(graph.getBusVolume('music')).toBe(100)
  })
})

describe('fallback without Web Audio', () => {
  it('uses element.volume (base x level) and follows the slider live', async () => {
    await load({ withContext: false })
    const audio = new Audio()
    expect(graph.routeElement(audio, 'sfx', 0.5)).toBe(false)
    expect(audio.volume).toBeCloseTo(0.5)
    graph.setBusVolume('sfx', 40)
    expect(audio.volume).toBeCloseTo(0.2)
    graph.setBusVolume('sfx', 0)
    expect(audio.volume).toBe(0)
  })

  it('falls back when routing throws', async () => {
    await load()
    ctx.createMediaElementSource.mockImplementation(() => {
      throw new Error('already connected')
    })
    const audio = new Audio()
    expect(graph.routeElement(audio, 'music', 1)).toBe(false)
    expect(audio.volume).toBeCloseTo(0.35)
  })
})

describe('autoplay unlock', () => {
  it('resumes a suspended context on the first gesture', async () => {
    await load()
    graph.getAudioContext()
    expect(graph.isAudioRunning()).toBe(false)
    document.dispatchEvent(new Event('pointerdown'))
    expect(ctx.resume).toHaveBeenCalled()
    expect(graph.isAudioRunning()).toBe(true)
  })

  it('resumeAudio is a no-op when already running', async () => {
    await load()
    graph.getAudioContext()
    ctx.state = 'running'
    graph.resumeAudio()
    expect(ctx.resume).not.toHaveBeenCalled()
  })
})
