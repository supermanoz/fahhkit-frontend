import { describe, expect, it } from 'vitest'
import {
  filterVisibleEmotes,
  isHiddenEmote,
  resolveEmoteAsset,
  resolveEquippedEmoteItem,
} from './emotes'

const HERO_ID = 'comet-hero-id'

function emoteItem(name) {
  return { id: `item-${name}`, category: 'EMOTE', heroId: HERO_ID, name }
}

describe('isHiddenEmote / filterVisibleEmotes - shop/picker lists only', () => {
  it('Comet emote2 (and emote4) are hidden; emote3 is not', () => {
    expect(isHiddenEmote('Comet', 'Emote2')).toBe(true)
    expect(isHiddenEmote('Comet', 'Emote4')).toBe(true)
    expect(isHiddenEmote('Comet', 'Emote3')).toBe(false)
  })

  it('filterVisibleEmotes still drops Comet emote2 from a catalog/slider list', () => {
    const items = [
      emoteItem('Emote1'),
      emoteItem('Emote2'),
      emoteItem('Emote3'),
    ]
    const visible = filterVisibleEmotes('Comet', items).map((i) => i.name)
    expect(visible).toEqual(['Emote1', 'Emote3'])
  })
})

describe('resolveEquippedEmoteItem', () => {
  // The actual bug: Comet's emote2 has real local art (see
  // heroes/comet/manifest.json) but is hidden from the shop. The default
  // (shop/picker) behaviour must keep treating it as "nothing equipped" so
  // it never gets its own slide; passing ignoreHidden:true (what the Me
  // tab and AthleteTerritoryProfilePanel.jsx now do) must resolve the real
  // equipped item instead of silently falling back to idle.
  it('default behaviour (shop/slider): a hidden-but-equipped emote resolves to nothing', () => {
    const equipped = resolveEquippedEmoteItem(
      [emoteItem('Emote2')],
      HERO_ID,
      'Comet'
    )
    expect(equipped).toBeNull()
  })

  it('ignoreHidden:true (profile/Me display): the same hidden-but-equipped emote resolves', () => {
    const equipped = resolveEquippedEmoteItem(
      [emoteItem('Emote2')],
      HERO_ID,
      'Comet',
      { ignoreHidden: true }
    )
    expect(equipped?.name).toBe('Emote2')
  })

  it('a non-hidden emote (emote3) resolves the same either way - other emotes keep working', () => {
    const withoutIgnore = resolveEquippedEmoteItem(
      [emoteItem('Emote3')],
      HERO_ID,
      'Comet'
    )
    const withIgnore = resolveEquippedEmoteItem(
      [emoteItem('Emote3')],
      HERO_ID,
      'Comet',
      { ignoreHidden: true }
    )
    expect(withoutIgnore?.name).toBe('Emote3')
    expect(withIgnore?.name).toBe('Emote3')
  })
})

// resolveEmoteAsset matches a backend StoreItem.name against a manifest
// key through the same canonicalEmoteKey (normalize + EMOTE_NAME_ALIASES)
// isHiddenEmote uses, so a name is never hidden-but-not-resolvable or
// resolvable-but-not-hideable. "Classic" is the one confirmed named
// exception (every real slot-2-and-up name is plain "emoteN" - see real
// captured profile data, and EMOTE_NAME_ALIASES' own comment on the
// earlier, wrong "Hip Hop" guess this replaces).
describe('resolveEmoteAsset - name/alias normalization', () => {
  it('"Classic" resolves to the idle alias for every hero, not idle-as-a-failure', () => {
    for (const heroName of ['Blaze', 'Nova', 'Bolt', 'Phantom']) {
      expect(resolveEmoteAsset(heroName, 'Classic')).not.toBeNull()
    }
  })

  it('is case/spacing-insensitive, same as isHiddenEmote', () => {
    const variants = ['Classic', 'classic', 'CLASSIC', ' Classic ']
    const results = variants.map((name) => resolveEmoteAsset('Nova', name))
    results.forEach((r) => expect(r).toEqual(results[0]))
    expect(results[0]).not.toBeNull()
  })

  it.each(['Blaze', 'Nova', 'Bolt', 'Phantom'])(
    "%s's plain numbered emotes (2, 3, 4, 5, 10) resolve",
    (heroName) => {
      expect(resolveEmoteAsset(heroName, 'emote3')).not.toBeNull()
      expect(resolveEmoteAsset(heroName, 'emote4')).not.toBeNull()
      expect(resolveEmoteAsset(heroName, 'emote5')).not.toBeNull()
    }
  )

  it('a name with genuinely no registry entry (e.g. Comet\'s "Jumping Jack") falls back to idle, not a crash', () => {
    expect(resolveEmoteAsset('Comet', 'Jumping Jack')).toBeNull()
  })
})
