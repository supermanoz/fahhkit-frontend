import { describe, expect, it } from 'vitest'
import { findDefaultHeroToBootstrap } from './defaultHero'

const cometItem = { id: 'c-item', category: 'HERO', priceFahhcoin: 0 }
const heroes = [{ id: 'c', name: 'Comet', skins: [cometItem] }]
const eq = (name, equipped = true) => ({
  equipped,
  storeItem: { id: 'x', category: 'HERO', name },
})

describe('findDefaultHeroToBootstrap', () => {
  it('clean account (no records) -> Comet item', () => {
    expect(findDefaultHeroToBootstrap(heroes, [])).toBe(cometItem)
  })
  it('a hero already equipped -> nothing to do', () => {
    expect(findDefaultHeroToBootstrap(heroes, [eq('Nova')])).toBeNull()
    expect(findDefaultHeroToBootstrap(heroes, [eq('Comet')])).toBeNull()
  })
  it('the placeholder "Default Hero" does not count as equipped', () => {
    expect(findDefaultHeroToBootstrap(heroes, [eq('Default Hero')])).toBe(
      cometItem
    )
  })
  it('roster not loaded yet -> nothing', () => {
    expect(findDefaultHeroToBootstrap([], [])).toBeNull()
  })
})
