// Blaze is the one hero with an animated run-cycle sprite sheet (see
// components/HeroSprite.jsx) instead of a flat image - this just names the
// match so both the profile panel and any future hero picker agree on it.
export function isBlazeHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'blaze'
}

// The backend seeds a generic "Default Hero" store item that every account
// owns and has equipped from signup. TEMP: until the backend gives everyone
// Blaze instead, the frontend treats that placeholder as "no hero picked",
// which falls through to Blaze, and hides it from the Heroes tab.
export const DEFAULT_HERO_NAME = 'Blaze'
export function isPlaceholderHero(name) {
  return (
    typeof name === 'string' && name.trim().toLowerCase() === 'default hero'
  )
}

// ScoreComponentTypeConstant → what the boost actually does, in player
// terms. RACE_TIME is the one where lower is better (a 0.95 multiplier
// shaves 5% off your PvP race time), so it reads as a minus.
const ABILITY_LABELS = {
  AREA: 'territory area score',
  PERIMETER_EFFICIENCY: 'perimeter efficiency score',
  PACE: 'pace score',
  CLOSURE_PRECISION: 'loop closure score',
  BASE_EFFORT: 'base effort score',
  RACE_TIME: 'race time',
}

// The pieces of describeHeroAbility, for UIs that lay them out separately
// (e.g. the stat bars in HeroDetailModal).
export function heroAbilityParts(ability) {
  if (!ability || ability.multiplier == null) return null
  return {
    pct: Math.round(Math.abs(ability.multiplier - 1) * 100),
    sign: ability.multiplier >= 1 ? '+' : '−',
    label:
      ABILITY_LABELS[ability.componentType] ||
      String(ability.componentType || '')
        .toLowerCase()
        .replace(/_/g, ' '),
  }
}

export function describeHeroAbility(ability) {
  const parts = heroAbilityParts(ability)
  return parts ? `${parts.sign}${parts.pct}% ${parts.label}` : ''
}
