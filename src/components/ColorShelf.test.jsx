import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ColorShelf from './ColorShelf'
import ColorItemSheet from './shop/ColorItemSheet'

const item = (id, name, price, over = {}) => ({
  id,
  name,
  category: 'TERRITORY_SHADE',
  priceFahhcoin: price,
  colorValue: '#8E24AA',
  ...over,
})
const own = (it, equipped = false) => ({ storeItem: it, equipped })

afterEach(cleanup)

const FREE = item('free', 'Blue', 0)
const CHEAP = item('cheap', 'Purple', 1500)
const DEAR = item('dear', 'Teal', 3000)
const OWNED = item('owned', 'Orange', 2000)
const ON = item('on', 'Red', 1000)

function shelf(over = {}) {
  const onSelect = vi.fn()
  const utils = render(
    <ColorShelf
      kind="territory"
      title="Territory"
      items={[DEAR, CHEAP, FREE, OWNED, ON]}
      ownedItems={[own(OWNED), own(ON, true)]}
      balance={2000}
      onSelect={onSelect}
      {...over}
    />
  )
  return { onSelect, ...utils }
}
const card = (name) => screen.getByRole('button', { name: new RegExp(name) })

describe('ColorShelf cards', () => {
  it('shows "<name> Flag" for territory and "<name> Trail" for trail', () => {
    shelf()
    expect(card('Purple Flag')).toBeTruthy()
    shelf({ kind: 'trail', title: 'Trail' })
    expect(
      screen.getAllByRole('button', { name: /Purple Trail/ })
    ).toHaveLength(1)
  })

  it('orders equipped, owned, free, then by price', () => {
    shelf()
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label').split(' - ')[0])
    expect(names).toEqual([
      'Red Flag', // equipped
      'Orange Flag', // owned
      'Blue Flag', // free
      'Purple Flag', // 1,500
      'Teal Flag', // 3,000
    ])
  })

  it('equipped: purple check badge + highlighted frame + "Equipped"', () => {
    shelf()
    const c = card('Red Flag')
    expect(c.className).toMatch(/is-equipped/)
    expect(c.querySelector('.cs-check')).toBeTruthy()
    expect(within(c).getByText('Equipped')).toBeTruthy()
  })

  it('owned: an "Owned" chip and an "Equip" action', () => {
    shelf()
    const c = card('Orange Flag')
    expect(within(c).getByText('Owned')).toBeTruthy()
    expect(within(c).getByText('Equip')).toBeTruthy()
  })

  it('free and not owned: a green "Get"', () => {
    shelf()
    expect(within(card('Blue Flag')).getByText('Get')).toBeTruthy()
  })

  it('not owned and affordable: a gold price button with the coin', () => {
    shelf()
    const c = card('Purple Flag')
    expect(c.querySelector('.cs-pill.is-price .game-coin')).toBeTruthy()
    expect(c.querySelector('.cs-pill.is-short')).toBeNull()
    expect(c.getAttribute('aria-label')).toMatch(/1,500 Fahhcoin/)
  })

  it('too few coins: disabled look + "Need X more"', () => {
    shelf()
    const c = card('Teal Flag')
    expect(c.querySelector('.cs-pill.is-short')).toBeTruthy()
    expect(within(c).getByText('Need 1,000 more')).toBeTruthy()
  })

  it('rarity frame: free vs premium', () => {
    shelf()
    expect(card('Blue Flag').className).toMatch(/is-free/)
    expect(card('Purple Flag').className).toMatch(/is-premium/)
  })

  it('a level-locked item shows the level, not a price', () => {
    shelf({
      items: [item('lv', 'Gold', 500, { unlockLevel: 8 })],
      ownedItems: [],
      level: 3,
    })
    expect(screen.getByText('Level 8')).toBeTruthy()
  })

  it('a whole card is one button: tapping it selects the item (no buy/equip here)', () => {
    const { onSelect } = shelf()
    fireEvent.click(card('Purple Flag'))
    expect(onSelect).toHaveBeenCalledWith(CHEAP)
    fireEvent.click(card('Red Flag'))
    expect(onSelect).toHaveBeenLastCalledWith(ON)
  })

  it('generates a name from the colour when an item has none', () => {
    shelf({
      items: [item('x', '', 100, { colorValue: '#DC143C' })],
      ownedItems: [],
    })
    expect(card('Crimson Flag')).toBeTruthy()
  })

  it('an empty shelf shows the empty text', () => {
    shelf({ items: [], emptyText: 'Nothing yet' })
    expect(screen.getByText('Nothing yet')).toBeTruthy()
  })
})

function sheet(it, state, over = {}) {
  const handlers = {
    onBuy: vi.fn(async () => {}),
    onEquip: vi.fn(async () => {}),
    onGetCoins: vi.fn(),
    onClose: vi.fn(),
  }
  const utils = render(
    <ColorItemSheet
      item={it}
      kind="territory"
      ownedItems={state.owned ?? []}
      balance={state.balance ?? 5000}
      {...handlers}
      {...over}
    />
  )
  return { ...handlers, ...utils }
}

describe('ColorItemSheet', () => {
  it('says what a flag / trail does', () => {
    sheet(CHEAP, {})
    expect(
      screen.getByText('Your claimed land will show in this color.')
    ).toBeTruthy()
    cleanup()
    sheet(CHEAP, {}, { kind: 'trail' })
    expect(screen.getByText('Your run line will look like this.')).toBeTruthy()
  })

  it('not owned: Buy calls the same purchase handler', async () => {
    const { onBuy } = sheet(CHEAP, {})
    fireEvent.click(screen.getByRole('button', { name: /Buy for/ }))
    expect(onBuy).toHaveBeenCalledWith(CHEAP)
  })

  it('free: Get it free calls the purchase handler', () => {
    const { onBuy } = sheet(FREE, { balance: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Get it free' }))
    expect(onBuy).toHaveBeenCalledWith(FREE)
  })

  it('too few coins: no Buy, a Get Fahhcoin button instead', () => {
    const { onBuy, onGetCoins } = sheet(DEAR, { balance: 2000 })
    expect(screen.queryByRole('button', { name: /Buy for/ })).toBeNull()
    expect(screen.getByText(/need 1,000 more/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Get Fahhcoin' }))
    expect(onGetCoins).toHaveBeenCalled()
    expect(onBuy).not.toHaveBeenCalled()
  })

  it('owned: Equip calls the equip handler (not equipped yet)', () => {
    const { onEquip } = sheet(OWNED, { owned: [own(OWNED)] })
    fireEvent.click(screen.getByRole('button', { name: 'Equip' }))
    expect(onEquip).toHaveBeenCalledWith(OWNED, false)
  })

  it('equipped: shows Equipped, and Unequip still works', () => {
    const { onEquip } = sheet(ON, { owned: [own(ON, true)] })
    expect(screen.getByText('Equipped')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unequip' }))
    expect(onEquip).toHaveBeenCalledWith(ON, true)
  })

  it('level locked: disabled, says which level', () => {
    sheet(item('lv', 'Gold', 500, { unlockLevel: 8 }), {}, { level: 3 })
    expect(
      screen.getByRole('button', { name: /Reach level 8 to unlock/ }).disabled
    ).toBe(true)
  })

  it('shows the purchase error', () => {
    sheet(CHEAP, {}, { purchaseError: 'Not enough Fahhcoin.' })
    expect(screen.getByRole('alert').textContent).toBe('Not enough Fahhcoin.')
  })

  it('shows a success state after buying, then after equipping', () => {
    const { rerender, ...h } = sheet(CHEAP, {})
    const props = (owned) => (
      <ColorItemSheet
        item={CHEAP}
        kind="territory"
        ownedItems={owned}
        balance={5000}
        onBuy={h.onBuy}
        onEquip={h.onEquip}
        onGetCoins={h.onGetCoins}
        onClose={h.onClose}
      />
    )
    rerender(props([own(CHEAP)])) // bought
    expect(screen.getByRole('status').textContent).toMatch(/Yours now/)
    rerender(props([own(CHEAP, true)])) // equipped
    expect(
      screen.getByText(/Equipped! You will see it on your next run/)
    ).toBeTruthy()
  })

  it('closes with the X and with Escape', () => {
    const { onClose } = sheet(CHEAP, {})
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('the open preview animates; the grid previews do not', () => {
    sheet(CHEAP, {})
    expect(
      document
        .querySelector('.cs-sheet-preview .cs-preview')
        .classList.contains('is-animated')
    ).toBe(true)
    shelf()
    expect(
      document
        .querySelector('.cs-grid .cs-preview')
        .classList.contains('is-animated')
    ).toBe(false)
  })
})
