import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import { createStoreItem, findHeroes, getStoreCatalog } from '../api/store'
import { isPlaceholderHero } from '../utils/hero'
import { knownEmoteNames, resolveEmoteAsset } from '../utils/emotes'
import './EmoteAdminPanel.css'
import Price from './Price'

const EMPTY_FORM = { heroId: '', name: '', priceFahhcoin: '0' }

// Creates real EMOTE StoreItem rows (category=EMOTE, heroId required) via
// the backend's existing admin endpoint - see api/store.js's
// createStoreItem. There's no update or delete endpoint for a plain item
// the way there is for a hero, so a row created here is permanent; the
// live-checked name below (resolveEmoteAsset) exists specifically to catch
// a typo before it becomes an unfixable "Classic 2" with no art.
export default function EmoteAdminPanel() {
  const [heroes, setHeroes] = useState([])
  const [heroesError, setHeroesError] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    findHeroes(1, 50)
      .then((page) =>
        setHeroes(
          (page?.content || []).filter((h) => !isPlaceholderHero(h.name))
        )
      )
      .catch((err) =>
        setHeroesError(
          err instanceof ApiError ? err.message : 'Could not load heroes.'
        )
      )
  }, [])

  useEffect(() => {
    setCatalogLoading(true)
    getStoreCatalog(1, 200)
      .then((page) =>
        setCatalog((page?.content || []).filter((i) => i.category === 'EMOTE'))
      )
      .catch((err) =>
        setCatalogError(
          err instanceof ApiError ? err.message : 'Could not load the catalog.'
        )
      )
      .finally(() => setCatalogLoading(false))
  }, [])

  const selectedHero = heroes.find((h) => h.id === form.heroId)
  const suggestions = selectedHero ? knownEmoteNames(selectedHero.name) : []
  const artFound =
    selectedHero && form.name.trim()
      ? Boolean(resolveEmoteAsset(selectedHero.name, form.name))
      : null

  const existingByHero = useMemo(() => {
    const groups = new Map()
    for (const item of catalog) {
      const list = groups.get(item.heroId) || []
      list.push(item)
      groups.set(item.heroId, list)
    }
    return groups
  }, [catalog])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.heroId || !form.name.trim()) return
    setError(null)
    setCreated(null)
    setBusy(true)
    try {
      const item = await createStoreItem({
        category: 'EMOTE',
        name: form.name.trim(),
        priceFahhcoin: Number(form.priceFahhcoin) || 0,
        heroId: form.heroId,
      })
      setCatalog((prev) => [...prev, item])
      setCreated(item)
      // Keep the hero picked - creating several emotes for the same hero
      // in a row is the common case.
      setForm({ ...EMPTY_FORM, heroId: form.heroId })
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not create that emote.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="emote-admin-panel">
      <p className="game-mechanics-hint">
        Creates a real, purchasable EMOTE StoreItem. There&apos;s no delete -
        double-check the hero and name (it must match the local art registry,
        case-insensitive, to show real art instead of a placeholder) before
        creating.
      </p>
      {heroesError && <div className="banner error">{heroesError}</div>}
      {error && <div className="banner error">{error}</div>}
      {created && (
        <div className="banner success">
          Created &quot;{created.name}&quot; for{' '}
          {heroes.find((h) => h.id === created.heroId)?.name || 'that hero'}.
          It&apos;ll appear in the Shop next time the catalog loads.
        </div>
      )}

      <form className="emote-admin-form" onSubmit={handleSubmit} noValidate>
        <div className="field full">
          <label>Hero</label>
          <select
            value={form.heroId}
            onChange={(e) => setForm({ ...form, heroId: e.target.value })}
            required
          >
            <option value="">Choose a hero…</option>
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>Emote name</label>
          <input
            type="text"
            list="emote-admin-name-suggestions"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Jumping Jack"
            required
          />
          <datalist id="emote-admin-name-suggestions">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {artFound != null && (
            <p
              className={`emote-admin-art-check ${artFound ? 'is-ok' : 'is-missing'}`}
            >
              {artFound
                ? '✓ Local art found for this hero + name.'
                : '⚠ No local art mapped - it will show a lock-icon placeholder.'}
            </p>
          )}
        </div>
        <div className="field full">
          <label>Price (Fahhcoin)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.priceFahhcoin}
            onChange={(e) =>
              setForm({ ...form, priceFahhcoin: e.target.value })
            }
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={!form.heroId || !form.name.trim() || busy}
        >
          {busy ? 'Creating…' : 'Create Emote'}
        </button>
      </form>

      <h3 className="emote-admin-existing-title">Existing emotes</h3>
      {catalogLoading ? (
        <p className="game-mechanics-muted">Loading…</p>
      ) : catalogError ? (
        <div className="banner error">{catalogError}</div>
      ) : catalog.length === 0 ? (
        <p className="game-mechanics-muted">No EMOTE rows exist yet.</p>
      ) : (
        <ul className="emote-admin-existing-list">
          {heroes
            .filter((h) => existingByHero.has(h.id))
            .map((h) => (
              <li key={h.id}>
                <span className="emote-admin-existing-hero">{h.name}</span>
                <span className="emote-admin-existing-items">
                  {existingByHero.get(h.id).map((item) => (
                    <span key={item.id} className="emote-admin-existing-chip">
                      {item.name} · <Price amount={item.priceFahhcoin} />
                    </span>
                  ))}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
