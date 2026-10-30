import { describe, expect, it } from 'vitest'
import { resolveHeroEquipState } from './heroEquipState'

const HERO_ID = 'hero-1'
const STORE_ITEM_ID = 'store-item-1'

function heroItem(overrides = {}) {
  return {
    equipped: false,
    storeItem: {
      id: STORE_ITEM_ID,
      heroId: HERO_ID,
      category: 'HERO',
    },
    ...overrides,
  }
}

describe('resolveHeroEquipState', () => {
  it('owned, not active -> tier "owned", a real item to equip', () => {
    const hero = { id: HERO_ID, skins: [] }
    const state = resolveHeroEquipState(hero, [heroItem()], null)
    expect(state.tier).toBe('owned')
    expect(state.equipped).toBe(false)
    expect(state.ownedHeroItem?.storeItem.id).toBe(STORE_ITEM_ID)
  })

  // The actual bug: equipping a hero is a reducer-style transition driven
  // entirely by the server's `ownedItems`/activeHeroId, the same shape a
  // fresh page load fetches - so "equip, then the UI shows Equipped" and
  // "reload, still equipped" are the same assertion against this pure
  // function, not two different code paths to test.
  it('equipping flips the tier - and a reload (same data, fresh call) agrees', () => {
    const hero = { id: HERO_ID, skins: [] }
    const beforeEquip = resolveHeroEquipState(hero, [heroItem()], null)
    expect(beforeEquip.tier).toBe('owned')

    // What loadStore() refetches after POST /store/:id/equip succeeds.
    const ownedItemsAfterEquip = [heroItem({ equipped: true })]
    const afterEquip = resolveHeroEquipState(
      hero,
      ownedItemsAfterEquip,
      HERO_ID
    )
    expect(afterEquip.tier).toBe('equipped')
    expect(afterEquip.equipped).toBe(true)

    // A reload re-mounts the component and re-fetches the same
    // ownedItems/activeHeroId from the server - re-running this pure
    // function against that same data has to land on the same answer,
    // since it has no state of its own to lose.
    const afterReload = resolveHeroEquipState(
      hero,
      ownedItemsAfterEquip,
      HERO_ID
    )
    expect(afterReload).toEqual(afterEquip)
  })

  it('locked (never owned) -> tier "locked", nothing to equip', () => {
    const hero = { id: HERO_ID, skins: [{ priceFahhcoin: 500 }] }
    const state = resolveHeroEquipState(hero, [], null)
    expect(state.tier).toBe('locked')
    expect(state.owned).toBe(false)
    expect(state.ownedHeroItem).toBeNull()
  })

  it('no skins released yet and never owned -> tier "soon", nothing to equip', () => {
    const hero = { id: HERO_ID, skins: [] }
    const state = resolveHeroEquipState(hero, [], null)
    expect(state.tier).toBe('soon')
    expect(state.ownedHeroItem).toBeNull()
  })

  // The actual edge case the equip bug hid: a hero can read as "owned"
  // from a skin/emote purchase alone, with the real HERO unlock never
  // bought - resolveHeroEquipState has to tell those apart, or a tap on
  // "Equip" has nothing valid to send and silently does nothing.
  it('a skin owned but not the hero itself -> "owned" tier, no item to equip', () => {
    const hero = { id: HERO_ID, skins: [] }
    const skinOnly = {
      equipped: false,
      storeItem: { id: 'skin-1', heroId: HERO_ID, category: 'SKIN' },
    }
    const state = resolveHeroEquipState(hero, [skinOnly], null)
    expect(state.owned).toBe(true)
    expect(state.tier).toBe('owned')
    expect(state.ownedHeroItem).toBeNull()
  })
})
