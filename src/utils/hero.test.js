import { describe, expect, it } from 'vitest'
import { DEFAULT_HERO_NAME, resolveHeroAssetOrDefault } from './hero'

const storeCatalog = [
  { id: 'blaze-item', name: 'Blaze', category: 'HERO', assetUrl: null },
  { id: 'nova-item', name: 'Nova', category: 'HERO', assetUrl: null },
  {
    id: 'comet-item',
    name: 'Default Hero',
    category: 'HERO',
    assetUrl: '/assets/store/default-hero.png',
  },
]

describe('resolveHeroAssetOrDefault', () => {
  // The actual bug: every real hero's StoreItem row has assetUrl: null
  // except Comet's (see V1_39/V1_45 seeds), so a lock-in that resolves to
  // a real, named hero must not be discarded just because that hero has
  // no art yet - two users who locked different heroes get different
  // names back from the same lookup (and so would a second call after a
  // "refresh", since this is a pure function over the same data).
  it('trusts a real hero name even with no assetUrl, and keeps picks distinct per user', () => {
    const blaze = resolveHeroAssetOrDefault('blaze-item', storeCatalog, [])
    const nova = resolveHeroAssetOrDefault('nova-item', storeCatalog, [])
    expect(blaze.name).toBe('Blaze')
    expect(nova.name).toBe('Nova')
    expect(blaze.name).not.toBe(nova.name)
  })

  it('still maps the backend\'s literal "Default Hero" placeholder name to Comet', () => {
    const picked = resolveHeroAssetOrDefault('comet-item', storeCatalog, [])
    expect(picked.name).toBe(DEFAULT_HERO_NAME)
  })

  it('falls back to Comet only when the id genuinely matches nothing', () => {
    const picked = resolveHeroAssetOrDefault('does-not-exist', storeCatalog, [])
    expect(picked.name).toBe(DEFAULT_HERO_NAME)
  })

  // Not this function's job: a null/undefined storeItemId (no hero locked
  // in yet) still resolves to Comet here by design (see this function's
  // own comment) - callers that need to tell "unlocked" apart from "a
  // genuine Comet pick" (e.g. ClubWarPanel's roster row, which shows "Not
  // locked" instead) must check p.lockedHeroStoreItemId for null/undefined
  // themselves before calling this, not rely on it to signal that.
  it('also defaults an absent storeItemId to Comet, by design', () => {
    const picked = resolveHeroAssetOrDefault(null, storeCatalog, [])
    expect(picked.name).toBe(DEFAULT_HERO_NAME)
  })
})
