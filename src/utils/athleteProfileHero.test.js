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

  // A hero+emote-name pair this registry genuinely has no art for (not a
  // HIDDEN_EMOTES case - see the Comet emote2 tests below for that one,
  // which must NOT fall back to idle) still falls back to idle, not a
  // broken glyph.
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

  // THE ACTUAL BUG: Comet's emote2 (and emote4) are hidden from the
  // shop/slider (see emotes.js's HIDDEN_EMOTES) but have real, working
  // local art - resolveEquippedEmoteItem used to treat "hidden" and "no
  // art" as the same thing, so a player with emote2 equipped silently fell
  // back to idle everywhere, including on another viewer's screen. A
  // hidden emote must only disappear from catalogs/pickers, never from an
  // already-equipped display.
  it('another viewer still sees a hidden-from-shop emote (Comet emote2) that is genuinely equipped', () => {
    const hero = cosmeticHero({ name: 'Comet' })
    const emote = emoteCosmetic({ name: 'Emote2' })
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

  it('a hidden emote (Comet emote2) also shows on your own profile, same as any other viewer', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: 'Comet',
      selfEmoteName: 'Emote2',
      selfShowsTurntable: true,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.equippedEmoteName).toBe('Emote2')
  })

  it("Comet's other (non-hidden) emotes keep working for another viewer", () => {
    const hero = cosmeticHero({ name: 'Comet' })
    const emote = emoteCosmetic({ name: 'Emote3' })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, emote],
    })
    expect(result.equippedEmoteName).toBe('Emote3')
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

  // THE actual real-world cause (checked directly against
  // db/migration/V1_64__hero_skin_emote_store_items.sql +
  // HeroItemOwnershipSupport.java): every hero's StoreItem.name for its
  // free default emote is the literal string "Classic", not "Emote1", and
  // it's auto-equipped for every player the moment they unlock a hero -
  // still live today, not a one-time migration artifact. No manifest.json
  // has a "classic" key, so before emotes.js's CLASSIC_ALIAS_TARGET fix
  // this resolved to no local art for every untouched hero - the dominant
  // real case, not an edge case, which is why "viewing another player's
  // profile never shows their emote" kept reproducing against the real
  // backend even though the heroId-gap fallback above was already working
  // correctly. Isolated from that gap here (heroId present) to prove this
  // is its own, separate fix.
  it('another player with the real default "Classic" emote equipped resolves to this hero\'s idle art', () => {
    const hero = cosmeticHero()
    const classic = emoteCosmetic({ name: 'Classic' })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, classic],
    })
    expect(result.equippedEmoteName).toBe('Classic')
  })

  // The two real bugs stacked, exactly as the live backend actually sends
  // them today: no heroId on any cosmetic (the TerritoryServiceImpl gap)
  // AND the equipped emote named "Classic" (the common case, not a rare
  // one). Both fixes have to hold at once for this to pass.
  it('another player with "Classic" equipped and no heroId at all (the real production shape) still resolves', () => {
    const hero = cosmeticHero({ heroId: undefined })
    const classic = emoteCosmetic({ name: 'Classic', heroId: undefined })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, classic],
    })
    expect(result.heroName).toBe('Nova')
    expect(result.equippedEmoteName).toBe('Classic')
  })

  // Same registry fix, the isSelf path (GamePage's own Me tab) - shares
  // resolveEmoteAsset with the other-player branch above, so a player who
  // still has their own hero's free default equipped must see it too, not
  // just another player's.
  it('self with the real default "Classic" emote equipped resolves it too', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: 'Nova',
      selfEmoteName: 'Classic',
      selfShowsTurntable: true,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.equippedEmoteName).toBe('Classic')
  })
})

// THE BUG: GET /v1/territory/profile/{userId} never sets
// StoreItemResponse.heroId (TerritoryServiceImpl#toUserStoreItemResponse) -
// every real cosmetic comes back with heroId null, confirmed against real
// captured profile data. Without a way to pair an equipped emote to the
// hero it's actually for, the old fallback ("the first equipped EMOTE
// cosmetic, whichever hero it's for") could pick a stale emote left
// equipped on a hero the player has since switched away from (equip is
// scoped per-hero server-side - switching your active hero never clears
// the OLD hero's own equipped emote) instead of the one actually playing
// on their Me tab. storeCatalog (GamePage's own Shop catalog, whose own
// mapper DOES set heroId correctly) backfills it by StoreItem id instead.
describe('resolveAthleteProfileHero - backend heroId gap, closed via storeCatalog backfill', () => {
  const BLAZE_ID = 'blaze-hero-id'
  const NOVA_ID = 'nova-hero-id'

  it("another viewer sees the active hero's real emote5, not a stale emote left equipped on a hero switched away from", () => {
    const hero = cosmeticHero({
      id: 'blaze-store-item',
      name: 'Blaze',
      heroId: null, // the bug: this endpoint never sets it
    })
    const staleClassic = emoteCosmetic({
      id: 'nova-classic-row',
      name: 'Classic',
      heroId: null, // leftover from a hero they've since switched away from
    })
    const emote5 = emoteCosmetic({
      id: 'blaze-emote5-row',
      name: 'emote5',
      heroId: null,
    })
    const storeCatalog = [
      { id: 'blaze-store-item', heroId: BLAZE_ID },
      { id: 'nova-classic-row', heroId: NOVA_ID },
      { id: 'blaze-emote5-row', heroId: BLAZE_ID },
    ]
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, staleClassic, emote5],
      storeCatalog,
    })
    expect(result.equippedEmoteName).toBe('emote5')
  })

  it('without storeCatalog, the same fixture falls back to "first equipped EMOTE, any hero" (reproduces the bug, not a regression target)', () => {
    const hero = cosmeticHero({
      id: 'blaze-store-item',
      name: 'Blaze',
      heroId: null,
    })
    const staleClassic = emoteCosmetic({
      id: 'nova-classic-row',
      name: 'Classic',
      heroId: null,
    })
    const emote5 = emoteCosmetic({
      id: 'blaze-emote5-row',
      name: 'emote5',
      heroId: null,
    })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, staleClassic, emote5],
    })
    expect(result.equippedEmoteName).toBe('Classic')
  })

  it('only emote5 equipped (no stale row) resolves correctly with or without the catalog', () => {
    const hero = cosmeticHero({
      id: 'blaze-store-item',
      name: 'Blaze',
      heroId: null,
    })
    const emote5 = emoteCosmetic({
      id: 'blaze-emote5-row',
      name: 'emote5',
      heroId: null,
    })
    const base = {
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, emote5],
    }
    const withoutCatalog = resolveAthleteProfileHero(base)
    const withCatalog = resolveAthleteProfileHero({
      ...base,
      storeCatalog: [
        { id: 'blaze-store-item', heroId: BLAZE_ID },
        { id: 'blaze-emote5-row', heroId: BLAZE_ID },
      ],
    })
    expect(withoutCatalog.equippedEmoteName).toBe('emote5')
    expect(withCatalog.equippedEmoteName).toBe('emote5')
  })

  it('only Classic equipped resolves to the idle pose, not a bug', () => {
    const hero = cosmeticHero({
      id: 'blaze-store-item',
      name: 'Blaze',
      heroId: null,
    })
    const classic = emoteCosmetic({
      id: 'blaze-classic-row',
      name: 'Classic',
      heroId: null,
    })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, classic],
      storeCatalog: [
        { id: 'blaze-store-item', heroId: BLAZE_ID },
        { id: 'blaze-classic-row', heroId: BLAZE_ID },
      ],
    })
    expect(result.equippedEmoteName).toBe('Classic')
  })

  // Own entry opened from a leaderboard/Club War row - GamePage wires this
  // to isSelf:true with the same selfHeroName/selfEmoteName the Me tab
  // uses (see GamePage.jsx's AthleteTerritoryProfilePanel render), never
  // storeCatalog/cosmetics at all, so the heroId gap above can't reach it.
  it('own entry opened from a list row (isSelf) shows emote5 - unaffected by the heroId gap above', () => {
    const result = resolveAthleteProfileHero({
      isSelf: true,
      selfHeroName: 'Blaze',
      selfEmoteName: 'emote5',
      selfShowsTurntable: true,
      cosmeticsHero: null,
      cosmetics: [],
    })
    expect(result.equippedEmoteName).toBe('emote5')
  })

  it.each([
    ['Nova', 'emote2'],
    ['Phantom', 'emote10'],
  ])(
    "%s's %s resolves for another viewer via the catalog backfill",
    (heroName, emoteName) => {
      const hero = cosmeticHero({ id: 'h-item', name: heroName, heroId: null })
      const emote = emoteCosmetic({
        id: 'e-item',
        name: emoteName,
        heroId: null,
      })
      const result = resolveAthleteProfileHero({
        isSelf: false,
        selfHeroName: null,
        selfEmoteName: null,
        selfShowsTurntable: false,
        cosmeticsHero: hero,
        cosmetics: [hero, emote],
        storeCatalog: [
          { id: 'h-item', heroId: 'some-hero-id' },
          { id: 'e-item', heroId: 'some-hero-id' },
        ],
      })
      expect(result.equippedEmoteName).toBe(emoteName)
    }
  )

  it('Comet\'s "Jumping Jack" (no registry entry yet) falls back to idle gracefully, not a crash', () => {
    const hero = cosmeticHero({ id: 'comet-item', name: 'Comet', heroId: null })
    const emote = emoteCosmetic({
      id: 'jj-item',
      name: 'Jumping Jack',
      heroId: null,
    })
    const result = resolveAthleteProfileHero({
      isSelf: false,
      selfHeroName: null,
      selfEmoteName: null,
      selfShowsTurntable: false,
      cosmeticsHero: hero,
      cosmetics: [hero, emote],
      storeCatalog: [
        { id: 'comet-item', heroId: 'comet-hero-id' },
        { id: 'jj-item', heroId: 'comet-hero-id' },
      ],
    })
    expect(result.equippedEmoteName).toBeNull()
  })
})
