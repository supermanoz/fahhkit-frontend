import { useEffect, useMemo, useState } from 'react'
import { getTerritoryProfileByUserId } from '../api/territory'
import { rivalHeroFromProfile } from '../utils/rivalHero'

// The equipped hero of each rival, read from their public territory profile
// (the PvP responses don't carry it). One request per rival, cached for the
// session (a failure is cached briefly so a dead endpoint isn't hammered), at
// most MAX ids per call. value: undefined = still loading, null = none/failed,
// object = the hero.
const TTL_OK = 10 * 60_000
const TTL_FAIL = 60_000
const MAX = 12
const cache = new Map() // userId -> { hero, at, ttl }
const inflight = new Map() // userId -> Promise

function fresh(entry) {
  return entry && Date.now() - entry.at < entry.ttl
}

function load(userId) {
  if (inflight.has(userId)) return inflight.get(userId)
  const p = getTerritoryProfileByUserId(userId)
    .then((profile) => ({ hero: rivalHeroFromProfile(profile), ttl: TTL_OK }))
    .catch(() => ({ hero: null, ttl: TTL_FAIL }))
    .then((r) => {
      cache.set(userId, { hero: r.hero, at: Date.now(), ttl: r.ttl })
      inflight.delete(userId)
      return r.hero
    })
  inflight.set(userId, p)
  return p
}

export function clearRivalHeroCache() {
  cache.clear()
  inflight.clear()
}

export function useRivalHeroes(userIds) {
  const key = useMemo(
    () => [...new Set((userIds || []).filter(Boolean))].slice(0, MAX).join(','),
    [userIds]
  )
  const [, bump] = useState(0)
  useEffect(() => {
    if (!key) return undefined
    let alive = true
    for (const id of key.split(',')) {
      if (!fresh(cache.get(id))) {
        load(id).then(() => alive && bump((n) => n + 1))
      }
    }
    return () => {
      alive = false
    }
  }, [key])
  const out = {}
  for (const id of key ? key.split(',') : []) {
    const entry = cache.get(id)
    out[id] = entry ? entry.hero : undefined
  }
  return out
}
