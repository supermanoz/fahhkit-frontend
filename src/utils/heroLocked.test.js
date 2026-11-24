import { describe, expect, it } from 'vitest'
import { resolveHeroEquipState } from './heroEquipState'

// The ONE locked flag the whole app reads (see components/heroLocked.css).
const item = (o = {}) => ({
  id: 'i1',
  category: 'HERO',
  heroId: 'h1',
  priceFahhcoin: 5000,
  ...o,
})
const row = (o = {}) => ({ equipped: false, storeItem: item(), ...o })

describe('hero locked flag', () => {
  it('price-locked, not owned -> locked', () => {
    const hero = { id: 'h1', skins: [item()] }
    const s = resolveHeroEquipState(hero, [], null, 10)
    expect(s.locked).toBe(true)
    expect(s.tier).toBe('locked')
  })
  it('level-locked (Nova) -> locked', () => {
    const hero = {
      id: 'h1',
      skins: [item({ priceFahhcoin: 0, unlockLevel: 5 })],
    }
    const s = resolveHeroEquipState(hero, [], null, 1)
    expect(s.locked).toBe(true)
    expect(s.tier).toBe('level-locked')
  })
  it('limited and coming-soon, not owned -> locked (same look as the rest)', () => {
    expect(
      resolveHeroEquipState(
        { id: 'h1', limited: true, skins: [item()] },
        [],
        null,
        10
      ).locked
    ).toBe(true)
    expect(
      resolveHeroEquipState({ id: 'h1', skins: [] }, [], null, 10).locked
    ).toBe(true)
  })
  it('owned and equipped -> full colour', () => {
    const hero = { id: 'h1', skins: [item()] }
    expect(resolveHeroEquipState(hero, [row()], null, 10).locked).toBe(false)
    expect(
      resolveHeroEquipState(hero, [row({ equipped: true })], 'h1', 10).locked
    ).toBe(false)
  })
  it('free hero (Comet) is never locked even with no row', () => {
    const hero = { id: 'h1', skins: [item({ priceFahhcoin: 0 })] }
    expect(resolveHeroEquipState(hero, [], null, 1).locked).toBe(false)
  })
  it('buying flips locked -> unlocked from the same data a reload would fetch', () => {
    const hero = { id: 'h1', skins: [item()] }
    expect(resolveHeroEquipState(hero, [], null, 10).locked).toBe(true)
    expect(resolveHeroEquipState(hero, [row()], null, 10).locked).toBe(false)
  })
})
