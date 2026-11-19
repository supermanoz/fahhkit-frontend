import { describe, expect, it, vi } from 'vitest'
import {
  PVP_SOURCES,
  createPvpEntry,
  resolveMatchStart,
  resolvePvpEntry,
} from './pvpEntry'

const ok = {
  locked: false,
  running: false,
  locationState: 'granted',
  discoverable: true,
  hasLiveRace: false,
}
const decide = (over, source = PVP_SOURCES.PLAY_MENU) =>
  resolvePvpEntry({ source, ...ok, ...over })

describe('resolvePvpEntry - the order of checks', () => {
  it('Visibility on + location ok -> enter', () => {
    expect(decide({})).toEqual({ action: 'enter', gatedStarts: false })
  })
  it('Visibility off -> the Turn on Visibility popup', () => {
    expect(decide({ discoverable: false })).toEqual({
      action: 'prompt',
      variant: 'visibility',
    })
  })
  it('location denied -> the Location is off popup (even with Visibility on)', () => {
    expect(decide({ locationState: 'denied' })).toEqual({
      action: 'prompt',
      variant: 'location',
    })
  })
  it('location denied beats Visibility off (location is checked first)', () => {
    expect(decide({ locationState: 'denied', discoverable: false })).toEqual({
      action: 'prompt',
      variant: 'location',
    })
  })
  it('an unknown location state is allowed (asked later)', () => {
    expect(decide({ locationState: 'unknown' }).action).toBe('enter')
  })
  it('rollout lock blocks everything, before any popup', () => {
    for (const source of Object.values(PVP_SOURCES)) {
      expect(
        decide(
          { locked: true, discoverable: false, locationState: 'denied' },
          source
        )
      ).toEqual({ action: 'blocked', reason: 'locked' })
    }
  })
  it('a run in progress blocks all but the alert pill', () => {
    for (const source of Object.values(PVP_SOURCES)) {
      const d = decide({ running: true }, source)
      if (source === PVP_SOURCES.ALERT_PILL) expect(d.action).toBe('enter')
      else expect(d).toEqual({ action: 'blocked', reason: 'running' })
    }
  })
  it('the lock is checked before the run rule', () => {
    expect(decide({ locked: true, running: true }).reason).toBe('locked')
  })
})

describe('active race exception', () => {
  it('a live race / search lets them in even with Visibility off', () => {
    expect(decide({ hasLiveRace: true, discoverable: false })).toEqual({
      action: 'enter',
      gatedStarts: true,
    })
  })
  it('...or with location denied, gating only new matches', () => {
    expect(decide({ hasLiveRace: true, locationState: 'denied' })).toEqual({
      action: 'enter',
      gatedStarts: true,
    })
  })
  it('with everything on, nothing is gated', () => {
    expect(decide({ hasLiveRace: true }).gatedStarts).toBe(false)
  })
  it('still respects the rollout lock', () => {
    expect(decide({ hasLiveRace: true, locked: true }).action).toBe('blocked')
  })
  it('starting a new match applies the same gate', () => {
    expect(
      resolveMatchStart({ locationState: 'granted', discoverable: false })
    ).toEqual({ variant: 'visibility' })
    expect(
      resolveMatchStart({ locationState: 'denied', discoverable: true })
    ).toEqual({ variant: 'location' })
    expect(
      resolveMatchStart({ locationState: 'granted', discoverable: true })
    ).toBeNull()
  })
})

function make(ctx = {}, over = {}) {
  const calls = []
  const deps = {
    getContext: () => ({ ...ok, ...ctx }),
    showGate: vi.fn((v) => calls.push(['gate', v])),
    hideGate: vi.fn(() => calls.push(['hide'])),
    turnOnVisibility: vi.fn(async () => true),
    runPortal: vi.fn(async (kind, onCovered) => {
      calls.push(['portal', kind])
      onCovered()
    }),
    openPvp: vi.fn((s) => calls.push(['open', s])),
    ...over,
  }
  return { deps, calls, entry: createPvpEntry(deps) }
}

describe('enterPvp - the single entry function', () => {
  it('every entry point goes through the same pipeline: portal then the hub', async () => {
    for (const source of Object.values(PVP_SOURCES)) {
      const { entry, calls } = make()
      const r = await entry.enterPvp(source)
      expect(r.status).toBe('entered')
      expect(calls).toEqual([
        ['portal', 'enter'],
        ['open', source],
      ])
    }
  })
  it('Visibility off -> popup, no portal, nothing opened', async () => {
    const { entry, deps } = make({ discoverable: false })
    expect(await entry.enterPvp(PVP_SOURCES.SECTION_MENU)).toEqual({
      status: 'prompt',
      variant: 'visibility',
    })
    expect(deps.showGate).toHaveBeenCalledWith(
      'visibility',
      PVP_SOURCES.SECTION_MENU
    )
    expect(deps.runPortal).not.toHaveBeenCalled()
    expect(deps.openPvp).not.toHaveBeenCalled()
  })
  it('location denied -> the location popup', async () => {
    const { entry, deps } = make({ locationState: 'denied' })
    expect((await entry.enterPvp('play-menu')).variant).toBe('location')
    expect(deps.showGate).toHaveBeenCalledWith('location', 'play-menu')
  })
  it('blocked entries do nothing at all', async () => {
    const { entry, deps } = make({ locked: true })
    expect(await entry.enterPvp('play-menu')).toEqual({
      status: 'blocked',
      reason: 'locked',
    })
    expect(deps.showGate).not.toHaveBeenCalled()
    expect(deps.runPortal).not.toHaveBeenCalled()
  })
  it('active-race exception: enters with Visibility off and reports gated starts', async () => {
    const { entry, deps } = make({ discoverable: false, hasLiveRace: true })
    const r = await entry.enterPvp(PVP_SOURCES.ALERT_PILL)
    expect(r).toMatchObject({ status: 'entered', gatedStarts: true })
    expect(deps.showGate).not.toHaveBeenCalled()
    expect(deps.openPvp).toHaveBeenCalledWith(PVP_SOURCES.ALERT_PILL)
  })
  it('rapid taps: a second call while entering is ignored', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    const { entry, deps } = make(
      {},
      {
        runPortal: vi.fn(async (_k, onCovered) => {
          await gate
          onCovered()
        }),
      }
    )
    const first = entry.enterPvp('play-menu')
    expect(await entry.enterPvp('play-menu')).toEqual({ status: 'ignored' })
    expect(await entry.enterPvp('section-menu')).toEqual({ status: 'ignored' })
    release()
    await first
    expect(deps.runPortal).toHaveBeenCalledTimes(1)
    expect(deps.openPvp).toHaveBeenCalledTimes(1)
    // And it can be entered again afterwards.
    expect((await entry.enterPvp('play-menu')).status).toBe('entered')
  })
})

describe('confirmVisibility - the Turn On button', () => {
  it('success: turns it on (the Settings call), closes the popup, continues into the portal', async () => {
    const { entry, deps, calls } = make({ discoverable: false })
    const r = await entry.confirmVisibility(PVP_SOURCES.PLAY_MENU)
    expect(r.status).toBe('entered')
    expect(deps.turnOnVisibility).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([
      ['hide'],
      ['portal', 'enter'],
      ['open', 'play-menu'],
    ])
  })
  it('API failure (returns false): stays put, popup stays, nothing opens', async () => {
    const { entry, deps } = make(
      {},
      { turnOnVisibility: vi.fn(async () => false) }
    )
    expect(await entry.confirmVisibility('play-menu')).toEqual({
      status: 'failed',
    })
    expect(deps.hideGate).not.toHaveBeenCalled()
    expect(deps.runPortal).not.toHaveBeenCalled()
    expect(deps.openPvp).not.toHaveBeenCalled()
  })
  it('API failure (throws / offline): same, never enters', async () => {
    const { entry, deps } = make(
      {},
      {
        turnOnVisibility: vi.fn(async () => {
          throw new Error('offline')
        }),
      }
    )
    expect(await entry.confirmVisibility('play-menu')).toEqual({
      status: 'failed',
    })
    expect(deps.openPvp).not.toHaveBeenCalled()
  })
  it('can be retried after a failure', async () => {
    const turnOn = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { entry, deps } = make({}, { turnOnVisibility: turnOn })
    expect((await entry.confirmVisibility('play-menu')).status).toBe('failed')
    expect((await entry.confirmVisibility('play-menu')).status).toBe('entered')
    expect(deps.openPvp).toHaveBeenCalledTimes(1)
  })
})
