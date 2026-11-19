// Display logic for the Shop's Territory (flag) and Trail colour items - pure,
// so it is unit-tested. Nothing here changes what an item costs, who owns it
// or how it is bought / equipped; it only decides how the item is presented.
import { isLevelLocked } from './itemState'

export const DEFAULT_COLOR = '#ff7a29'

// Only hex colours reach CSS / SVG attributes.
export function safeColor(value, fallback = DEFAULT_COLOR) {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())
    ? value.trim()
    : fallback
}

function hexToHsl(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let hue
  if (max === r) hue = ((g - b) / d) % 6
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  return { h: (hue * 60 + 360) % 360, s, l }
}

// A friendly colour name from a hex, for an item that has no name of its own.
export function nameFromHex(hex) {
  const value = safeColor(hex, null)
  if (!value) return ''
  const { h, s, l } = hexToHsl(value)
  if (l < 0.13) return 'Onyx'
  if (l > 0.92 && s < 0.2) return 'Snow'
  if (s < 0.14) return l > 0.6 ? 'Silver' : 'Slate'
  if (h < 12 || h >= 345) return 'Crimson'
  if (h < 40) return 'Sunset'
  if (h < 68) return 'Gold'
  if (h < 150) return 'Emerald'
  if (h < 185) return 'Teal'
  if (h < 225) return 'Sky'
  if (h < 255) return 'Cobalt'
  if (h < 295) return 'Violet'
  return 'Magenta'
}

// "<name> Flag" / "<name> Trail" - the item's own name, or one generated from
// its colour. kind: 'territory' | 'trail'.
export function itemDisplayName(item, kind) {
  const suffix = kind === 'trail' ? 'Trail' : 'Flag'
  const base = item?.name?.trim() || nameFromHex(item?.colorValue) || 'Classic'
  return new RegExp(`\\s${suffix}$`, 'i').test(base)
    ? base
    : `${base} ${suffix}`
}

// The backend has no rarity or "free" flag: price 0 is how free items arrive,
// anything with a price is premium.
export function rarityOf(item) {
  return Number(item?.priceFahhcoin) > 0 ? 'premium' : 'free'
}

const ownedRow = (item, ownedItems) =>
  (ownedItems || []).find((o) => o.storeItem?.id === item?.id) || null

// One clear state per item:
//   equipped | owned | level-locked | free (Get) | buy | short (not enough coins)
export function colorCardState({ item, ownedItems, balance = 0, level }) {
  const row = ownedRow(item, ownedItems)
  if (row) return { kind: row.equipped ? 'equipped' : 'owned', needMore: 0 }
  if (isLevelLocked(item, level))
    return { kind: 'level-locked', needMore: 0, level: item.unlockLevel }
  const price = Number(item?.priceFahhcoin) || 0
  if (price <= 0) return { kind: 'free', needMore: 0 }
  if (balance >= price) return { kind: 'buy', needMore: 0 }
  return { kind: 'short', needMore: price - balance }
}

// Equipped first, then owned, then free, then by price (cheapest first).
export function sortColorItems(items, ownedItems) {
  const rank = (item) => {
    const row = ownedRow(item, ownedItems)
    if (row?.equipped) return 0
    if (row) return 1
    return rarityOf(item) === 'free' ? 2 : 3
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        rank(a.item) - rank(b.item) ||
        (Number(a.item.priceFahhcoin) || 0) -
          (Number(b.item.priceFahhcoin) || 0) ||
        a.index - b.index
    )
    .map((x) => x.item)
}

export const EFFECT_LINE = {
  territory: 'Your claimed land will show in this color.',
  trail: 'Your run line will look like this.',
}
