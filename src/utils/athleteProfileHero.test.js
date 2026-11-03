import { describe, expect, it } from 'vitest'
import { resolveAthleteProfileHero } from './athleteProfileHero'
import { DEFAULT_HERO_NAME } from './hero'

const HERO_ID = 'hero-1'

function cosmeticHero(overrides = {}) {
  return {
    storeItem: {
      category: 'HERO',
      name: 'Nova',
      heroId: HERO_ID,
      assetUrl: 'nova.png',
      ...overrides,
    },
  }
}

function emoteCosmetic(overrides = {}) {
  return {
    storeItem: {
      category: 'EMOTE',
      name: 'Emote2',
      heroId: HERO_ID,
      ...overrides,
    },
  }
}

describe('resolveAthleteProfileHero', () => {
  // The actual bug: opening your own leaderboard entry used to read off
  // this fetch's equippedCosmetics the same way an unrelated player's
  // profile does, which came back with no usable HERO row for a player on
  // a local avatar pick rather than a real equipped Store Hero - leaving
  // the hero/emote area blank.
  it('self with a real equipped hero and emote - renders both, never blank', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: 'Nova',
      selfEmoteName: 'Emote2',
      selfShowsTurntable: true,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.heroName).toBe('Nova')
    expect(result.equippedEmoteName).toBe('Emote2')
    expect(result.showsTurntable).toBe(true)
  })

  it('self with no equipped hero/emote data at all - falls back to DEFAULT_HERO + idle, not blank', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: true,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.heroName).toBe(DEFAULT_HERO_NAME)
    expect(result.heroName).not.toBeNull()
    expect(result.equippedEmoteName).toBeNull()
  })

  it('self ignores cosmeticsHero entirely, even if present - the Me-tab selectors are the source of truth for your own profile', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: 'Blaze',
      selfEmoteName: null,
      selfShowsTurntable: true,
      cosmeticsHero: cosmeticHero({ name: 'Phantom' }),
      cosmetics: [],
    })
    expect(result.heroName).toBe('Blaze')
  })

  // The bug this session found: every one of the 7 heroes has a real
  // bundled manifest.json now (the 2026-11-02 Cyclone/Nova/Phantom/Pulse
  // refresh), same as GamePage.jsx's own showHeroTurntable already checks
  // via hasHero() - but this resolver was still gating the animated
  // turntable behind a stale isBlazeHero/isCometHero/isBoltHero check left
  // over from when only 3 heroes had sprite art. Another player who'd
  // equipped any of the other 4 heroes got a flat StoreItem.assetUrl image
  // instead (often broken/blank too, since that admin-uploaded field isn't
  // reliably seeded - see ClubWarMemberAvatar.jsx's own history with it).
  it.each(['Blaze', 'Bolt', 'Comet', 'Cyclone', 'Nova', 'Phantom', 'Pulse'])(
    'another player with %s equipped gets the animated turntable, not the flat asset image',
    (name) => {
      const hero = cosmeticHero({ name })
      const result = resolveAthleteProfileHero({
        isSelf: false,
        selfHeroName: null,
        selfEmoteName: null,
        selfShowsTurntable: false,
        cosmeticsHero: hero,
        cosmetics: [hero],
      })
      expect(result.heroName).toBe(name)
      expect(result.showsTurntable).toBe(true)
    }
  )

  it('another player with no hero equipped at all falls back to the turntable, not blank', () => {
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.heroName).toBeNull()
    expect(result.showsTurntable).toBe(true)
  })

  it('another player with a real equipped emote resolves it by name', () => {
    const hero = cosmeticHero()
    const emote = emoteCosmetic()
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, emote],
    })
    expect(result.equippedEmoteName).toBe('Emote2')
  })

  it('another player with no emote equipped falls back to idle (null), not an error', () => {
    const hero = cosmeticHero()
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero],
    })
    expect(result.equippedEmoteName).toBeNull()
  })

  // resolveEquippedEmoteItem (emotes.js) already treats a hidden emote
  // that's still equipped server-side as "nothing equipped" - this just
  // confirms that filtering survives the trip through this resolver too,
  // for a hero+emote-name pair this registry genuinely has no art for
  // (standing in for both the HIDDEN_EMOTES case and a plain missing-asset
  // gap, since both end up at the same "no local art" check).
  it('an equipped emote name with no local art falls back to idle (null), not a broken glyph', () => {
    const hero = cosmeticHero()
    const bogus = emoteCosmetic({ name: 'Not A Real Emote' })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, bogus],
    })
    expect(result.equippedEmoteName).toBeNull()
  })

  // Same asset-validation gap, but on the isSelf path - GamePage.jsx passes
  // selfEmoteName straight off its own equippedEmoteItem without checking
  // equippedEmoteAsset first (it only does that check in its OWN render
  // branch), so an unmapped emote could otherwise reach this panel's main
  // stage unvalidated now that it plays EmoteGlyph directly instead of
  // just a small side badge.
  it('self with an equipped emote name that has no local art falls back to idle (null)', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: 'Nova',
      selfEmoteName: 'Not A Real Emote',
      selfShowsTurntable: true,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.equippedEmoteName).toBeNull()
  })

  // The emote must belong to the equipped hero, not just exist somewhere
  // in the cosmetics list - resolveEquippedEmoteItem's own heroId match
  // already enforces this; this just locks in that this resolver doesn't
  // accidentally bypass it (e.g. a club war member who'd equipped a
  // different hero for CLUB war games or a store refund/swap leaving a
  // stale EMOTE row with a mismatched heroId in `cosmetics`).
  it('an equipped emote for a different heroId than the equipped hero is ignored', () => {
    const hero = cosmeticHero()
    const wrongHeroEmote = emoteCosmetic({ heroId: 'some-other-hero' })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, wrongHeroEmote],
    })
    expect(result.equippedEmoteName).toBeNull()
  })

  // The real-world case right now: GET /v1/territory/profile/{userId}
  // never sets StoreItemResponse.heroId at all (confirmed by reading
  // TerritoryServiceImpl directly - see this file's own comment on the
  // fallback this locks in), so every cosmetic in the response - the hero
  // included - has heroId: undefined. Without the fallback this would
  // resolve to no emote for every other player's profile, regardless of
  // what's actually equipped.
  it('falls back to the one equipped emote when the backend sent no heroId at all (current real-world gap)', () => {
    const hero = cosmeticHero({ heroId: undefined })
    const emote = emoteCosmetic({ heroId: undefined })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, emote],
    })
    expect(result.equippedEmoteName).toBe('Emote2')
  })

  // The fallback only kicks in when heroId is genuinely absent - once the
  // backend gap above is fixed, a real mismatch (stale equipped=true row
  // from a hero this player has since switched away from) must still be
  // caught, same as the strict-match test above.
  it('does not fall back when heroId is present but simply mismatched', () => {
    const hero = cosmeticHero()
    const wrongHeroEmote = emoteCosmetic({ heroId: 'some-other-hero' })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, wrongHeroEmote],
    })
    expect(result.equippedEmoteName).toBeNull()
  })
})
