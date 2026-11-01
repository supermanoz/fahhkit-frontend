/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { FaChevronDown } from 'react-icons/fa'
import { ApiError, resolveFileUrl } from '../api/client'
import {
  createPartner,
  getCurrentSeasonPartners,
  updatePartner,
} from '../api/sponsorPartners'
import './SponsorBannerAdminPanel.css'

const EMPTY_FORM = {
  name: '',
  email: '',
  seasonNumber: '',
  imageUrl: '',
  socialLink1: '',
  active: true,
}

function partnerToForm(p) {
  return {
    name: p.name || '',
    email: p.email || '',
    seasonNumber: String(p.seasonNumber ?? ''),
    imageUrl: p.imageUrl || '',
    socialLink1: p.socialLink1 || '',
    active: Boolean(p.active),
  }
}

// For create (PartnerCreateRequest wants name/email/seasonNumber too).
function toCreatePayload(form) {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    seasonNumber: Number(form.seasonNumber),
    imageUrl: form.imageUrl.trim() || null,
    socialLink1: form.socialLink1.trim() || null,
    active: form.active,
  }
}

// For update - PartnerUpdateRequest has no email/seasonNumber field at all
// (see its own comment: "intentionally not editable... use extend to move
// a partnership forward"), so sending them here would just be silently
// ignored server-side. Leaving them out instead of relying on that is both
// more honest about what this call can actually change and matches the
// disabled inputs below.
function toUpdatePayload(form) {
  return {
    name: form.name.trim(),
    imageUrl: form.imageUrl.trim() || null,
    socialLink1: form.socialLink1.trim() || null,
    active: form.active,
  }
}

// Shared create/edit form - same field set either way, only the fields the
// leaderboard banner actually uses (see SponsorBannerCarousel.jsx; the
// Partner entity also has phone/socialLink2-5/description, left off this
// form since nothing here reads them). Email/season are shown but disabled
// once editing an existing partner - PartnerUpdateRequest can't change
// them (see toUpdatePayload above), so letting someone type a new value in
// and hit Save, only to have it silently do nothing, would be worse than
// not offering the field at all.
function PartnerForm({
  form,
  onChange,
  onSubmit,
  busy,
  error,
  submitLabel,
  isEdit = false,
}) {
  return (
    <form className="sponsor-admin-form" onSubmit={onSubmit} noValidate>
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
          Email{' '}
          {isEdit && (
            <span className="opt">
              (fixed - extend to a new season instead)
            </span>
          )}
        </label>
        <input
          type="email"
          required
          disabled={isEdit}
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />
      </div>
      <div className="field full">
        <label>
          Season number {isEdit && <span className="opt">(fixed)</span>}
        </label>
        <input
          type="number"
          min="1"
          step="1"
          required
          disabled={isEdit}
          value={form.seasonNumber}
          onChange={(e) => onChange({ ...form, seasonNumber: e.target.value })}
        />
      </div>
      <div className="field full">
        <label>
          Logo image URL <span className="opt">(optional)</span>
        </label>
        <input
          type="url"
          placeholder="https://…"
          value={form.imageUrl}
          onChange={(e) => onChange({ ...form, imageUrl: e.target.value })}
        />
      </div>
      <div className="field full">
        <label>
          Redirect link <span className="opt">(optional - socialLink1)</span>
        </label>
        <input
          type="url"
          placeholder="https://…"
          pattern="https://.*"
          title="Must be an https:// URL"
          value={form.socialLink1}
          onChange={(e) => onChange({ ...form, socialLink1: e.target.value })}
        />
      </div>
      <label className="sponsor-admin-checkbox">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => onChange({ ...form, active: e.target.checked })}
        />
        Active
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

function PartnerRow({ partner, expanded, onToggle, onSaved }) {
  const [form, setForm] = useState(() => partnerToForm(partner))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setSaveError(null)
    setSaved(false)
    setSaving(true)
    try {
      // PartnerUpdateRequest's id field is `partnerId`, not `id` - sending
      // `id` left it blank server-side (@NotBlank), so every save/toggle
      // was silently 400ing before this fix.
      const updated = await updatePartner({
        partnerId: partner.id,
        ...toUpdatePayload(form),
      })
      onSaved(updated)
      setSaved(true)
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : 'Could not save that partner.'
      )
    } finally {
      setSaving(false)
    }
  }

  // No dedicated toggle-active endpoint - this is the same partial-update
  // endpoint as Save, just with only id+active set (see api/sponsorPartners.js).
  async function handleToggleActive() {
    setTogglingActive(true)
    try {
      const updated = await updatePartner({
        partnerId: partner.id,
        active: !partner.active,
      })
      onSaved(updated)
    } catch {
      // Quick one-tap toggle, not a form submit - no separate error banner.
    } finally {
      setTogglingActive(false)
    }
  }

  return (
    <li className="sponsor-admin-row">
      <button
        type="button"
        className="sponsor-admin-row-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {partner.imageUrl && (
          <img
            className="sponsor-admin-row-thumb"
            src={resolveFileUrl(partner.imageUrl)}
            alt=""
          />
        )}
        <span className="sponsor-admin-row-info">
          <span className="sponsor-admin-row-name">{partner.name}</span>
          <span className="sponsor-admin-row-meta">
            Season {partner.seasonNumber} ·{' '}
            {partner.active ? 'Active' : 'Inactive'}
          </span>
        </span>
        <FaChevronDown
          className={`game-mechanics-section-chevron ${expanded ? 'is-open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="sponsor-admin-row-body">
          {saved && <div className="banner success">Saved.</div>}
          <div className="sponsor-admin-row-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={togglingActive}
              onClick={handleToggleActive}
            >
              {togglingActive
                ? 'Working…'
                : partner.active
                  ? 'Deactivate'
                  : 'Activate'}
            </button>
          </div>
          <PartnerForm
            form={form}
            onChange={setForm}
            onSubmit={handleSave}
            busy={saving}
            error={saveError}
            submitLabel="Save changes"
            isEdit
          />
        </div>
      )}
    </li>
  )
}

// Sponsor banner (leaderboard ad) management, wired to the existing Partner
// API (/v1/partner/*) - see api/sponsorPartners.js for exactly what that
// does and doesn't support. No search/pagination/delete here because the
// backend has no find or delete endpoint for Partner - getCurrentSeasonPartners
// is the only read, so this just lists whatever season is "current" and
// edits in place.
export default function SponsorBannerAdminPanel() {
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getCurrentSeasonPartners()
      .then((data) => setPartners(data || []))
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load sponsor banners.'
        )
      )
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setCreateError(null)
    setCreateBusy(true)
    try {
      const partner = await createPartner(toCreatePayload(createForm))
      setPartners((prev) => [partner, ...prev])
      setCreateForm(EMPTY_FORM)
      setCreating(false)
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? err.message
          : 'Could not create that sponsor banner.'
      )
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="sponsor-admin-panel">
      {!creating ? (
        <button
          type="button"
          className="btn btn-outline sponsor-admin-new-btn"
          onClick={() => setCreating(true)}
        >
          + New Sponsor Banner
        </button>
      ) : (
        <div className="sponsor-admin-create">
          <PartnerForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            busy={createBusy}
            error={createError}
            submitLabel="Create banner"
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setCreating(false)
              setCreateForm(EMPTY_FORM)
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
      ) : partners.length === 0 ? (
        <p className="game-mechanics-muted">
          No sponsor banners for the current season yet.
        </p>
      ) : (
        <ul className="sponsor-admin-list">
          {partners.map((partner) => (
            <PartnerRow
              key={partner.id}
              partner={partner}
              expanded={expandedId === partner.id}
              onToggle={() =>
                setExpandedId((id) => (id === partner.id ? null : partner.id))
              }
              onSaved={(updated) =>
                setPartners((prev) =>
                  prev.map((p) =>
                    p.id === partner.id ? { ...p, ...updated } : p
                  )
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
