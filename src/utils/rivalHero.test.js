import { describe, expect, it } from 'vitest'
import { rivalHeroFromProfile } from './rivalHero'

const item = (category, name, extra = {}) => ({
  storeItem: { category, name, ...extra },
  equipped: true,
})

describe('rivalHeroFromProfile', () => {
  it('takes the equipped HERO from the public profile', () => {
    const hero = rivalHeroFromProfile({
      equippedCosmetics: [
        item('PHRASE', 'GG'),
        item('HERO', 'Cyclone', { heroId: 'h1', assetUrl: '/files/c.png' }),
      ],
    })
    expect(hero).toEqual({
      name: 'Cyclone',
      id: 'h1',
      assetUrl: '/files/c.png',
      color: null,
    })
  })
  it('no hero equipped / placeholder hero / junk -> null (caller uses the default hero)', () => {
    expect(rivalHeroFromProfile({ equippedCosmetics: [] })).toBeNull()
    expect(rivalHeroFromProfile({})).toBeNull()
    expect(rivalHeroFromProfile(null)).toBeNull()
    expect(
      rivalHeroFromProfile({ equippedCosmetics: [item('SKIN', 'Inferno')] })
    ).toBeNull()
    expect(
      rivalHeroFromProfile({
        equippedCosmetics: [item('HERO', 'Default Hero')],
      })
    ).toBeNull()
    expect(
      rivalHeroFromProfile({ equippedCosmetics: [{ storeItem: null }] })
    ).toBeNull()
  })
})
