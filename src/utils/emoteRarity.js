// Frontend-only rarity classification for the Fortnite-style Emotes screen
// (EmoteSelectScreen.jsx/EmoteShowcase.jsx) - StoreItem has no rarity field
// on the backend (see ~/Documents/FahhKit's StoreItem.java), so rather than
// ask for a schema change for a purely cosmetic label/border color, this
// derives a tier from priceFahhcoin, which every EMOTE row already has.
// Free ("Classic", every hero's starter) reads as Common; paid tiers step
// up with price. Never touches purchase/equip logic, which still goes
// entirely off priceFahhcoin - this only decides how a tile/card looks.
const RARITY_TIERS = [
  { max: 0, key: 'common', label: 'COMMON', color: '#9aa0a6' },
  { max: 199, key: 'rare', label: 'RARE', color: '#4d9bff' },
  { max: 499, key: 'epic', label: 'EPIC', color: '#b36bff' },
  { max: Infinity, key: 'legendary', label: 'LEGENDARY', color: '#ffb13d' },
]

export function getEmoteRarity(priceFahhcoin) {
  const price = priceFahhcoin || 0
  return (
    RARITY_TIERS.find((tier) => price <= tier.max) ||
    RARITY_TIERS[RARITY_TIERS.length - 1]
  )
}

// Short flavor line for the detail card's description - StoreItem has no
// description field either. Known poses (see utils/emotes.js) get a
// hand-written line; any future admin-created emote with no entry here
// still gets a real sentence instead of a blank card.
const FLAVOR_TEXT = {
  classic: 'Your go-to stance. Simple, steady, always in style.',
  'hip hop': 'Bust out the signature moves when a run goes right.',
  victory: 'Take the win lap you earned.',
  'checking shoes': 'Lace check before the next lap.',
  'jumping jack': 'Shake out the legs between sprints.',
  'shoulder rub': 'Work out the knots after a hard climb.',
  squat: 'Hold the burn and show it off.',
}

export function getEmoteFlavorText(emoteName) {
  const key = (emoteName || '').trim().toLowerCase()
  return FLAVOR_TEXT[key] || 'A signature move, earned out on the run.'
}
