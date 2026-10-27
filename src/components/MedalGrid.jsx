/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { resolveFileUrl } from '../api/client'
import { IconLock, IconTrophy } from './GameIcons'

// Two separate medal concepts exist in the backend, surfaced together here:
//
// 1. `profile.medals` (TerritoryProfileResponse.medals, MedalResponse) - raw
//    "you placed #N this season" records: seasonNumber/rankPosition/
//    medalType only, no name/art. Shown as a compact "Season Ranks" strip.
// 2. The MEDAL StoreItem category (same generic catalog/owned-items calls
//    the Shop already uses, just category === 'MEDAL') - real name + art,
//    but never purchasable (system/admin-granted only: season top-3, a
//    season participation trophy, or a manual admin grant - see
//    MedalItemService server-side). Shown as the earned/locked grid.
//
// Neither source has a description, "how to earn" text, or a progress
// fraction anywhere in the backend (same data gap as the Emote system) -
// so "how to earn" below is a generic line per grant type inferred from
// the medal's own name, not a real backend field. If the backend ever adds
// real criteria text, swap this heuristic for it directly.
function inferHowToEarn(item) {
  const name = (item.name || '').toLowerCase()
  if (
    name.includes('champion') ||
    name.includes('1st') ||
    name.includes('gold')
  )
    return 'Finish #1 individually when a season ends.'
  if (
    name.includes('runner') ||
    name.includes('2nd') ||
    name.includes('silver')
  )
    return 'Finish #2 individually when a season ends.'
  if (name.includes('3rd') || name.includes('bronze') || name.includes('third'))
    return 'Finish #3 individually when a season ends.'
  if (name.includes('participa') || name.includes('season'))
    return 'Complete at least one run during the season.'
  return 'Awarded by the game - keep playing to find out how.'
}

const NEW_MEDALS_KEY = 'fahhkit_seen_medal_ids'

function loadSeenIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(NEW_MEDALS_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function saveSeenIds(ids) {
  try {
    localStorage.setItem(NEW_MEDALS_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage blocked - "new" highlighting just won't persist across visits.
  }
}

const RANK_LABEL = { 1: '#1', 2: '#2', 3: '#3' }

export default function MedalGrid({
  catalog,
  ownedItems,
  seasonMedals,
  loading,
}) {
  const medalItems = (catalog || []).filter((i) => i.category === 'MEDAL')
  const ownedMedalIds = new Set(
    (ownedItems || [])
      .filter((o) => o.storeItem.category === 'MEDAL')
      .map((o) => o.storeItem.id)
  )

  // A medal counts as "new" the first time it's seen owned - compares
  // against a locally-remembered set from the last visit, then updates
  // that set. Runs once per mount (this component is only ever shown while
  // the Me tab is open, so "once per visit" is the right cadence).
  const [newIds, setNewIds] = useState(new Set())
  useEffect(() => {
    if (!catalog || catalog.length === 0) return
    const seen = loadSeenIds()
    const freshlyEarned = [...ownedMedalIds].filter((id) => !seen.has(id))
    if (freshlyEarned.length > 0) setNewIds(new Set(freshlyEarned))
    const next = new Set([...seen, ...ownedMedalIds])
    saveSeenIds(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, ownedItems])

  return (
    <section className="game-me-section">
      <p className="game-menu-section-title">Medals</p>

      {seasonMedals && seasonMedals.length > 0 && (
        <ul className="medal-season-list">
          {seasonMedals.map((m) => (
            <li key={m.id} className="medal-season-chip">
              <IconTrophy aria-hidden="true" />
              Season {m.seasonNumber} ·{' '}
              {RANK_LABEL[m.rankPosition] || `#${m.rankPosition}`}{' '}
              {m.medalType === 'CLUB' ? 'Club' : 'Individual'}
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <p className="game-menu-empty">Loading medals…</p>
      ) : medalItems.length === 0 ? (
        <p className="game-menu-empty">No medals to show yet.</p>
      ) : (
        <div className="medal-grid">
          {medalItems.map((item) => {
            const owned = ownedMedalIds.has(item.id)
            const isNew = owned && newIds.has(item.id)
            return (
              <div
                key={item.id}
                className={`medal-tile ${owned ? 'is-earned' : 'is-locked'}`}
                title={owned ? item.name : `${item.name} - locked`}
              >
                {isNew && <span className="medal-new-badge">New!</span>}
                <span className="medal-tile-preview">
                  {item.assetUrl ? (
                    <img
                      src={resolveFileUrl(item.assetUrl)}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <IconTrophy aria-hidden="true" />
                  )}
                  {!owned && (
                    <span className="medal-tile-lock" aria-hidden="true">
                      <IconLock />
                    </span>
                  )}
                </span>
                <span className="medal-tile-name">{item.name}</span>
                <span className="medal-tile-how">{inferHowToEarn(item)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
