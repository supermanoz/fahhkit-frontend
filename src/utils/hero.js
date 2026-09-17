// Blaze is the one hero with an animated run-cycle sprite sheet (see
// components/HeroSprite.jsx) instead of a flat image - this just names the
// match so both the profile panel and any future hero picker agree on it.
export function isBlazeHero(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'blaze'
}
