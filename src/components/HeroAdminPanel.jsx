/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { FaChevronDown, FaSearch } from 'react-icons/fa'
import { ApiError } from '../api/client'
import {
  attachHeroAbility,
  createHero,
  findHeroes,
  getHero,
  updateHero,
} from '../api/store'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { ABILITY_LABELS, SCORE_COMPONENT_TYPES } from '../utils/hero'
import './HeroAdminPanel.css'

const HERO_PAGE_SIZE = 8
const MAX_ABILITIES_PER_HERO = 2
const EMPTY_HERO_FORM = {
  name: '',
  tagline: '',
  backstory: '',
  portraitUrl: '',
  limited: false,
}

function heroToForm(hero) {
  return {
    name: hero.name || '',
    tagline: hero.tagline || '',
    backstory: hero.backstory || '',
    portraitUrl: hero.portraitUrl || '',
    limited: Boolean(hero.limited),
  }
}

// Inline create/edit form, shared between "+ New Hero" and an expanded
// row's editor - same fields either way (HeroCreateRequest and
// HeroUpdateRequest carry the same set, see api/store.js). No "active"
// toggle - see createHero's comment for why deactivating a hero here would
// make it unreachable through this same list again.
function HeroForm({ form, onChange, onSubmit, busy, error, submitLabel }) {
  return (
    <form className="hero-admin-form" onSubmit={onSubmit}>
      {error && <div className="banner error">{error}</div>}
      <div className="field full">
        <label>Name</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field full">
        <label>
          Tagline <span className="opt">(optional)</span>
        </label>
        <input
          type="text"
          value={form.tagline}
          onChange={(e) => onChange({ ...form, tagline: e.target.value })}
        />
      </div>
      <div className="field full">
        <label>
          Backstory <span className="opt">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={form.backstory}
          onChange={(e) => onChange({ ...form, backstory: e.target.value })}
        />
      </div>
      <div className="field full">
        <label>
          Portrait URL <span className="opt">(optional)</span>
        </label>
        <input
          type="text"
          value={form.portraitUrl}
          onChange={(e) => onChange({ ...form, portraitUrl: e.target.value })}
        />
      </div>
      <label className="hero-admin-checkbox">
        <input
          type="checkbox"
          checked={form.limited}
          onChange={(e) => onChange({ ...form, limited: e.target.checked })}
        />
        Limited (event/reward only - not purchasable)
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

// A hero's abilities - attach-only, no edit or delete (see
// attachHeroAbility's comment), so existing ones render read-only and the
// form below just offers whichever component types aren't taken yet.
function HeroAbilities({ heroId, abilities, onAttached }) {
  const [form, setForm] = useState({ componentType: '', multiplier: '1.05' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const usedTypes = new Set(abilities.map((a) => a.componentType))
  const availableTypes = SCORE_COMPONENT_TYPES.filter((t) => !usedTypes.has(t))
  const atLimit = abilities.length >= MAX_ABILITIES_PER_HERO

  async function handleAttach(e) {
    e.preventDefault()
    if (!form.componentType) return
    setError(null)
    setBusy(true)
    try {
      const ability = await attachHeroAbility(
        heroId,
        form.componentType,
        Number(form.multiplier)
      )
      onAttached(ability)
      setForm({ componentType: '', multiplier: '1.05' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not attach that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hero-admin-abilities">
      <h4>Abilities</h4>
      {abilities.length === 0 ? (
        <p className="game-mechanics-muted">
          No abilities yet - pure style, runs on vibes alone.
        </p>
      ) : (
        <ul className="hero-admin-ability-list">
          {abilities.map((a) => (
            <li key={a.id}>
              <span>{ABILITY_LABELS[a.componentType] || a.componentType}</span>
              <span className="hero-admin-ability-value">
                {a.multiplier >= 1 ? '+' : '−'}
                {Math.round(Math.abs(a.multiplier - 1) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      {atLimit ? (
        <p className="game-mechanics-muted">
          Max {MAX_ABILITIES_PER_HERO} abilities per hero reached.
        </p>
      ) : (
        <form className="hero-admin-attach-form" onSubmit={handleAttach}>
          {error && <div className="banner error">{error}</div>}
          <select
            value={form.componentType}
            onChange={(e) =>
              setForm({ ...form, componentType: e.target.value })
            }
            required
          >
            <option value="">Add an ability…</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {ABILITY_LABELS[t] || t}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0.9"
            max="1.1"
            value={form.multiplier}
            onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
            title="0.90-1.10 (e.g. 1.05 = +5%, 0.95 = -5%)"
            required
          />
          <button
            type="submit"
            className="btn btn-outline"
            disabled={busy || !form.componentType}
          >
            {busy ? '…' : 'Attach'}
          </button>
        </form>
      )}
    </div>
  )
}

// One hero row, collapsed to name/tagline until tapped, then expanding into
// its full edit form + abilities - same recipe as MailPanel's expand-on-tap
// rows.
function HeroRow({ hero, expanded, onToggle }) {
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [form, setForm] = useState(() => heroToForm(hero))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!expanded || detail) return
    setDetailLoading(true)
    setDetailError(null)
    getHero(hero.id)
      .then((data) => {
        setDetail(data)
        setForm(heroToForm(data))
      })
      .catch((err) =>
        setDetailError(
          err instanceof ApiError ? err.message : 'Could not load that hero.'
        )
      )
      .finally(() => setDetailLoading(false))
    // Fetches once, the first time this row expands - detail then stays
    // cached on this row for the rest of its lifetime (collapsing only
    // hides the body, it doesn't unmount this component), so re-expanding
    // never re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  async function handleSave(e) {
    e.preventDefault()
    setSaveError(null)
    setSaved(false)
    setSaving(true)
    try {
      const updated = await updateHero(hero.id, form)
      setDetail((prev) => (prev ? { ...prev, ...updated } : prev))
      setSaved(true)
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : 'Could not save that hero.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="hero-admin-row">
      <button
        type="button"
        className="hero-admin-row-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="hero-admin-row-info">
          <span className="hero-admin-row-name">
            {hero.name}
            {hero.limited && (
              <span className="hero-admin-row-badge">Limited</span>
            )}
          </span>
          {hero.tagline && (
            <span className="hero-admin-row-tagline">{hero.tagline}</span>
          )}
        </span>
        <FaChevronDown
          className={`game-mechanics-section-chevron ${expanded ? 'is-open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="hero-admin-row-body">
          {detailLoading ? (
            <p className="game-mechanics-muted">Loading…</p>
          ) : detailError ? (
            <div className="banner error">{detailError}</div>
          ) : (
            <>
              {saved && <div className="banner success">Saved.</div>}
              <HeroForm
                form={form}
                onChange={setForm}
                onSubmit={handleSave}
                busy={saving}
                error={saveError}
                submitLabel="Save changes"
              />
              {detail && (
                <HeroAbilities
                  heroId={hero.id}
                  abilities={detail.abilities || []}
                  onAttached={(ability) =>
                    setDetail((prev) => ({
                      ...prev,
                      abilities: [...(prev.abilities || []), ability],
                    }))
                  }
                />
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

// Hero codex management - create new heroes and edit existing ones (name,
// tagline, backstory, portrait, limited flag) plus attach score abilities,
// all server-side tools that previously had no admin UI at all (see
// HeroController in the FahhKit backend).
export default function HeroAdminPanel() {
  const [heroes, setHeroes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState(null)

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_HERO_FORM)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    setLoading(true)
    setError(null)
    findHeroes(page, HERO_PAGE_SIZE, debouncedSearch)
      .then((result) => {
        setHeroes(result?.content || [])
        setTotalPages(Math.max(1, result?.totalPages || 1))
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : 'Could not load heroes.'
        )
      )
      .finally(() => setLoading(false))
  }, [page, debouncedSearch])

  async function handleCreate(e) {
    e.preventDefault()
    setCreateError(null)
    setCreateBusy(true)
    try {
      const hero = await createHero(createForm)
      setHeroes((prev) => [hero, ...prev])
      setCreateForm(EMPTY_HERO_FORM)
      setCreating(false)
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Could not create that hero.'
      )
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="hero-admin-panel">
      <div className="game-mechanics-search-box">
        <FaSearch className="game-mechanics-search-icon" />
        <input
          type="text"
          placeholder="Search heroes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!creating ? (
        <button
          type="button"
          className="btn btn-outline hero-admin-new-btn"
          onClick={() => setCreating(true)}
        >
          + New Hero
        </button>
      ) : (
        <div className="hero-admin-create">
          <HeroForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            busy={createBusy}
            error={createError}
            submitLabel="Create hero"
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setCreating(false)
              setCreateForm(EMPTY_HERO_FORM)
              setCreateError(null)
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && <div className="banner error">{error}</div>}
      {loading ? (
        <p className="game-mechanics-muted">Loading…</p>
      ) : heroes.length === 0 ? (
        <p className="game-mechanics-muted">
          {search ? `No heroes match "${search}".` : 'No heroes yet.'}
        </p>
      ) : (
        <ul className="hero-admin-list">
          {heroes.map((hero) => (
            <HeroRow
              key={hero.id}
              hero={hero}
              expanded={expandedId === hero.id}
              onToggle={() =>
                setExpandedId((id) => (id === hero.id ? null : hero.id))
              }
            />
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <div className="game-mechanics-pagination">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Prev
          </button>
          <span className="game-mechanics-pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
