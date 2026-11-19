import { describe, expect, it } from 'vitest'
import {
  colorCardState,
  itemDisplayName,
  nameFromHex,
  rarityOf,
  safeColor,
  sortColorItems,
} from './shopColors'

const item = (over) => ({
  id: 'i',
  name: 'Purple',
  priceFahhcoin: 1500,
  colorValue: '#8E24AA',
  ...over,
})
const own = (it, equipped = false) => ({ storeItem: it, equipped })

describe('names', () => {
  it('uses the item name, adding Flag / Trail', () => {
    expect(itemDisplayName(item(), 'territory')).toBe('Purple Flag')
    expect(itemDisplayName(item(), 'trail')).toBe('Purple Trail')
  })
  it('does not double the suffix', () => {
    expect(itemDisplayName(item({ name: 'Sunset Flag' }), 'territory')).toBe(
      'Sunset Flag'
    )
    expect(itemDisplayName(item({ name: 'Teal trail' }), 'trail')).toBe(
      'Teal trail'
    )
  })
  it('generates a name from the colour when the item has none', () => {
    expect(
      itemDisplayName(item({ name: '', colorValue: '#DC143C' }), 'territory')
    ).toBe('Crimson Flag')
    expect(
      itemDisplayName(item({ name: null, colorValue: '#00897B' }), 'trail')
    ).toBe('Teal Trail')
  })
  it('names common colours sensibly', () => {
    const cases = {
      '#DC143C': 'Crimson',
      '#E53935': 'Crimson',
      '#FB8C00': 'Sunset',
      '#FDD835': 'Gold',
      '#43A047': 'Emerald',
      '#00897B': 'Teal',
      '#4A90D9': 'Sky',
      '#8E24AA': 'Violet',
      '#212121': 'Onyx',
      '#616161': 'Slate',
      '#bdbdbd': 'Silver',
    }
    for (const [hex, name] of Object.entries(cases))
      expect(nameFromHex(hex)).toBe(name)
  })
  it('falls back to Classic with neither a name nor a colour', () => {
    expect(itemDisplayName({}, 'territory')).toBe('Classic Flag')
  })
  it('only lets hex colours through', () => {
    expect(safeColor('#abc')).toBe('#abc')
    expect(safeColor('red; background:url(x)')).toBe('#ff7a29')
    expect(safeColor(undefined, '#000')).toBe('#000')
  })
})

describe('rarity frame', () => {
  it('free = price 0, premium = anything with a price', () => {
    expect(rarityOf(item({ priceFahhcoin: 0 }))).toBe('free')
    expect(rarityOf(item({ priceFahhcoin: 1500 }))).toBe('premium')
  })
})

describe('colorCardState - one clear state', () => {
  const base = { item: item(), ownedItems: [], balance: 5000 }
  it('not owned, affordable -> buy', () => {
    expect(colorCardState(base)).toEqual({ kind: 'buy', needMore: 0 })
  })
  it('not owned, too few coins -> short, with how many more', () => {
    expect(colorCardState({ ...base, balance: 1000 })).toEqual({
      kind: 'short',
      needMore: 500,
    })
    expect(colorCardState({ ...base, balance: 0 }).needMore).toBe(1500)
  })
  it('free and not owned -> Get', () => {
    expect(
      colorCardState({ ...base, item: item({ priceFahhcoin: 0 }), balance: 0 })
        .kind
    ).toBe('free')
  })
  it('owned / equipped come from the owned row', () => {
    const it = item()
    expect(
      colorCardState({ ...base, item: it, ownedItems: [own(it)] }).kind
    ).toBe('owned')
    expect(
      colorCardState({ ...base, item: it, ownedItems: [own(it, true)] }).kind
    ).toBe('equipped')
  })
  it('an owned item is owned however many coins you have', () => {
    const it = item()
    expect(
      colorCardState({ item: it, ownedItems: [own(it)], balance: 0 }).kind
    ).toBe('owned')
  })
  it('level lock beats everything for an item you do not own', () => {
    const r = colorCardState({
      ...base,
      item: item({ unlockLevel: 8 }),
      level: 3,
    })
    expect(r).toMatchObject({ kind: 'level-locked', level: 8 })
    expect(
      colorCardState({ ...base, item: item({ unlockLevel: 8 }), level: 9 }).kind
    ).toBe('buy')
  })
})

describe('sort: equipped, owned, free, then price ascending', () => {
  const a = item({ id: 'a', name: 'A', priceFahhcoin: 3000 })
  const b = item({ id: 'b', name: 'B', priceFahhcoin: 1000 })
  const c = item({ id: 'c', name: 'C', priceFahhcoin: 0 })
  const d = item({ id: 'd', name: 'D', priceFahhcoin: 1500 })
  const e = item({ id: 'e', name: 'E', priceFahhcoin: 2000 })
  const f = item({ id: 'f', name: 'F', priceFahhcoin: 0 })
  it('orders everything as specified', () => {
    const owned = [own(e), own(d, true)]
    expect(sortColorItems([a, b, c, d, e, f], owned).map((x) => x.id)).toEqual([
      'd', // equipped
      'e', // owned
      'c', // free
      'f', // free
      'b', // 1000
      'a', // 3000
    ])
  })
  it('owned items sort by price too, and the sort does not mutate the input', () => {
    const input = [a, b]
    sortColorItems(input, [own(a), own(b)])
    expect(input.map((x) => x.id)).toEqual(['a', 'b'])
    expect(sortColorItems(input, [own(a), own(b)]).map((x) => x.id)).toEqual([
      'b',
      'a',
    ])
  })
  it('is stable for equal prices', () => {
    const x = item({ id: 'x', priceFahhcoin: 1000 })
    const y = item({ id: 'y', priceFahhcoin: 1000 })
    expect(sortColorItems([x, y], []).map((i) => i.id)).toEqual(['x', 'y'])
  })
})
