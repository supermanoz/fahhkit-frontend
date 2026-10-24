// Blaze is the one hero with an animated run-cycle sprite sheet (see
// components/HeroSprite.jsx) instead of a flat image - this just names the
// match so both the profile panel and any future hero picker agree on it.
export function isBlazeHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'blaze'
}

export function isCometHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'comet'
}

// The backend seeds a generic "Default Hero" store item that every account
// owns and has equipped from signup. TEMP: until the backend gives everyone
// Comet instead, the frontend treats that placeholder as "no hero picked",
// which falls through to Comet (the default hero for now), and hides it
// from the Heroes tab.
export const DEFAULT_HERO_NAME = 'Comet'
export function isPlaceholderHero(name) {
  return (
    typeof name === 'string' && name.trim().toLowerCase() === 'default hero'
  )
}

// ScoreComponentTypeConstant → what the boost actually does, in player
// terms. RACE_TIME is the one where lower is better (a 0.95 multiplier
// shaves 5% off your PvP race time), so it reads as a minus. Exported too -
// the Game Mechanics hero admin panel uses the same labels for its "attach
// an ability" picker instead of showing the raw enum names.
export const ABILITY_LABELS = {
  AREA: 'territory area score',
  PERIMETER_EFFICIENCY: 'perimeter efficiency score',
  PACE: 'pace score',
  CLOSURE_PRECISION: 'loop closure score',
  BASE_EFFORT: 'base effort score',
  RACE_TIME: 'race time',
}

export const SCORE_COMPONENT_TYPES = Object.keys(ABILITY_LABELS)

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
