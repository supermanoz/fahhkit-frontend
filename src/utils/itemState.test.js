import { describe, expect, it } from 'vitest'
import {
  getItemState,
  ITEM_STATE,
  needsClaim,
  visibleStoreError,
} from './itemState'

const free = { id: 'a', priceFahhcoin: 0 }
const paid = { id: 'b', priceFahhcoin: 500 }
const row = (item, equipped = false) => ({ storeItem: item, equipped })

describe('getItemState', () => {
  it('priced item with no row is locked', () => {
    expect(getItemState(paid, [])).toBe(ITEM_STATE.LOCKED)
  })
  it('free item with no row is owned for everyone, and needs a claim', () => {
    expect(getItemState(free, [])).toBe(ITEM_STATE.OWNED)
    expect(needsClaim(free, [])).toBe(true)
    expect(needsClaim(free, [row(free)])).toBe(false)
    expect(needsClaim(paid, [])).toBe(false)
  })
  it('a row means owned, an equipped row means equipped', () => {
    expect(getItemState(paid, [row(paid)])).toBe(ITEM_STATE.OWNED)
    expect(getItemState(paid, [row(paid, true)])).toBe(ITEM_STATE.EQUIPPED)
  })
  it('equipped always wins, even for a priced item with no row', () => {
    expect(getItemState(paid, [], { equipped: true })).toBe(ITEM_STATE.EQUIPPED)
  })
  it('the virtual idle item (id null) is owned', () => {
    expect(getItemState({ id: null }, [])).toBe(ITEM_STATE.OWNED)
  })
})

describe('visibleStoreError', () => {
  const msg = "You don't own this item yet!"
  it('shows the not-owned message only when locked', () => {
    expect(visibleStoreError(msg, ITEM_STATE.LOCKED)).toBe(msg)
    expect(visibleStoreError(msg, ITEM_STATE.OWNED)).toBeNull()
    expect(visibleStoreError(msg, ITEM_STATE.EQUIPPED)).toBeNull()
  })
  it('other errors always pass through', () => {
    expect(visibleStoreError('Boom', ITEM_STATE.EQUIPPED)).toBe('Boom')
  })
})
