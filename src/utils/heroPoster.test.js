import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POSTER_HERO,
  hasPoster,
  posterConfig,
  resolveHeroKey,
} from './heroPoster'
import {
  POSTER_ROUTE_BOX,
  POSTER_W,
  STORY_SAFE,
  posterLayout,
} from './shareCanvas'

const HEROES = [
  { id: 11, name: 'Nova' },
  { id: 12, name: 'Cyclone' },
  { id: 13, name: 'Pulse' },
  { id: 14, name: 'Phantom' },
  { id: 15, name: 'Blaze' },
  { id: 16, name: 'Comet' },
  { id: 17, name: 'Bolt' },
]

describe('hero posters', () => {
  it('has a poster for every one of the 7 heroes', () => {
    for (const h of HEROES) expect(hasPoster(h.name.toLowerCase())).toBe(true)
  })

  it('1) prefers the server loadout (by id, or by name)', () => {
    const run = { loadout: { heroId: 14, heroName: 'Phantom' }, heroId: 11 }
    expect(resolveHeroKey(run, { id: 17 }, HEROES)).toBe('phantom')
    expect(
      resolveHeroKey({ loadout: { heroId: 14 } }, { id: 17 }, HEROES)
    ).toBe('phantom')
    expect(
      resolveHeroKey({ loadout: { heroName: 'Bolt' } }, null, HEROES)
    ).toBe('bolt')
  })

  it('2) falls back to the heroId saved on the run at start', () => {
    expect(resolveHeroKey({ heroId: 12 }, { id: 17 }, HEROES)).toBe('cyclone')
    expect(
      resolveHeroKey({ loadout: null, heroId: 15 }, { id: 17 }, HEROES)
    ).toBe('blaze')
    expect(resolveHeroKey({ meta: { heroId: 13 } }, null, HEROES)).toBe('pulse')
  })

  it('3) then the equipped hero, and finally the default', () => {
    expect(resolveHeroKey({}, { id: 17, name: 'Bolt' }, HEROES)).toBe('bolt')
    expect(resolveHeroKey({}, { name: 'Nova' }, HEROES)).toBe('nova')
    expect(resolveHeroKey({}, null, HEROES)).toBe(DEFAULT_POSTER_HERO)
    // An unknown hero never breaks the card.
    expect(
      resolveHeroKey({ loadout: { heroId: 999, heroName: 'Zed' } }, null, [])
    ).toBe(DEFAULT_POSTER_HERO)
  })

  it('keeps all text and the route inside the Story safe zone', () => {
    for (const h of HEROES) {
      const key = h.name.toLowerCase()
      const L = posterLayout(key, 0.5)
      const cfg = posterConfig(key)
      expect(L.cx - cfg.colWidth / 2).toBeGreaterThanOrEqual(STORY_SAFE.side)
      expect(L.cx + cfg.colWidth / 2).toBeLessThanOrEqual(
        POSTER_W - STORY_SAFE.side
      )
      expect(L.route.x).toBeGreaterThanOrEqual(STORY_SAFE.side)
      expect(L.route.x + L.route.w).toBeLessThanOrEqual(
        POSTER_W - STORY_SAFE.side
      )
      expect(L.route.y).toBeGreaterThanOrEqual(STORY_SAFE.top)
      expect(L.route.y + POSTER_ROUTE_BOX.h).toBeLessThanOrEqual(1920 - 340)
      expect(L.logo.y).toBeGreaterThanOrEqual(STORY_SAFE.top - 30) // padding
      const last = L.stats[2]
      expect(last.valueBaseline).toBeLessThanOrEqual(1920 - STORY_SAFE.bottom)
    }
  })

  it('pulls a mis-tuned stats column back inside the safe zone', () => {
    // posterConfig is per hero and hand-edited: a wild value must be clamped.
    const L = posterLayout('comet')
    expect(L.stats).toHaveLength(3)
    expect(L.stats[1].labelY - L.stats[0].labelY).toBe(367)
  })
})
