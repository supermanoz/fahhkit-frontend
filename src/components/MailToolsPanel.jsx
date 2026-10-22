/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { sendNotice, sendStoreItemGrant } from '../api/mail'
import { getStoreCatalog } from '../api/store'
import { findPlayerByNickname } from '../api/user'
import './MailToolsPanel.css'

const EMPTY_RECIPIENT = {
  nickname: '',
  resolved: null,
  error: null,
  busy: false,
}

// Exact-nickname lookup shared by both forms below - resolves to the
// {id, nickname, fullName} the server actually needs (recipientUserId),
// since neither admin endpoint takes a nickname directly.
function RecipientField({ state, onChange }) {
  async function handleLookup(e) {
    e.preventDefault()
    const nickname = state.nickname.trim()
    if (!nickname) return
    onChange({ ...state, busy: true, error: null })
    const player = await findPlayerByNickname(nickname)
    if (!player) {
      onChange({
        ...state,
        busy: false,
        error: 'No player with that nickname.',
        resolved: null,
      })
      return
    }
    onChange({ ...state, busy: false, resolved: player })
  }

  if (state.resolved) {
    return (
      <div className="field full">
        <label>Recipient</label>
        <div className="mail-tools-recipient-chip">
          <span>
            {state.resolved.fullName || state.resolved.nickname}
            {state.resolved.fullName && (
              <span className="mail-tools-recipient-nickname">
                @{state.resolved.nickname}
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onChange({ ...EMPTY_RECIPIENT })}
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="field full">
      <label>Recipient nickname</label>
      <div className="mail-tools-recipient-lookup">
        <input
          type="text"
          placeholder="exact nickname"
          value={state.nickname}
          onChange={(e) =>
            onChange({ ...state, nickname: e.target.value, error: null })
          }
          // Without this, Enter here submits the surrounding form instead
          // of running the lookup - handleSubmit then no-ops (no recipient
          // resolved yet) with zero feedback, which read as "Find is
          // broken" since typing a nickname and hitting Enter is the
          // obvious first thing to try.
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLookup(e)
          }}
        />
        <button
          type="button"
          className="btn btn-outline"
          disabled={!state.nickname.trim() || state.busy}
          onClick={handleLookup}
        >
          {state.busy ? '…' : 'Find'}
        </button>
      </div>
      {state.error && (
        <p className="mail-tools-recipient-error">{state.error}</p>
      )}
    </div>
  )
}

function GrantItemForm() {
  const [catalog, setCatalog] = useState([])
  const [catalogError, setCatalogError] = useState(null)
  const [recipient, setRecipient] = useState(EMPTY_RECIPIENT)
  const [storeItemId, setStoreItemId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    getStoreCatalog(1, 200)
      .then((page) => setCatalog(page?.content || []))
      .catch((err) =>
        setCatalogError(
          err instanceof ApiError ? err.message : 'Could not load the catalog.'
        )
      )
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!recipient.resolved || !storeItemId) return
    setError(null)
    setSent(false)
    setBusy(true)
    try {
      await sendStoreItemGrant(recipient.resolved.id, storeItemId, title, body)
      setSent(true)
      setRecipient(EMPTY_RECIPIENT)
      setStoreItemId('')
      setTitle('')
      setBody('')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send that grant.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mail-tools-form" onSubmit={handleSubmit} noValidate>
      <h3>Gift an Item</h3>
      <p className="game-mechanics-hint">
        Lands as a claimable grant in one player&apos;s inbox - same claim flow
        as any other store-item mail.
      </p>
      {sent && <div className="banner success">Sent.</div>}
      {error && <div className="banner error">{error}</div>}
      {catalogError && <div className="banner error">{catalogError}</div>}
      <RecipientField state={recipient} onChange={setRecipient} />
      <div className="field full">
        <label>Item</label>
        <select
          value={storeItemId}
          onChange={(e) => setStoreItemId(e.target.value)}
          required
        >
          <option value="">Choose an item…</option>
          {catalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.category})
            </option>
          ))}
        </select>
      </div>
      <div className="field full">
        <label>
          Title <span className="opt">(optional)</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field full">
        <label>
          Body <span className="opt">(optional)</span>
        </label>
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={!recipient.resolved || !storeItemId || busy}
      >
        {busy ? 'Sending…' : 'Send Gift'}
      </button>
    </form>
  )
}

function SendNoticeForm() {
  const [recipient, setRecipient] = useState(EMPTY_RECIPIENT)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!recipient.resolved || !title.trim() || !body.trim()) return
    setError(null)
    setSent(false)
    setBusy(true)
    try {
      await sendNotice(recipient.resolved.id, title, body)
      setSent(true)
      setRecipient(EMPTY_RECIPIENT)
      setTitle('')
      setBody('')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send that notice.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mail-tools-form" onSubmit={handleSubmit} noValidate>
      <h3>Send a Notice</h3>
      <p className="game-mechanics-hint">
        A one-off, read-only message to one player&apos;s inbox - the private
        counterpart to the broadcast above.
      </p>
      {sent && <div className="banner success">Sent.</div>}
      {error && <div className="banner error">{error}</div>}
      <RecipientField state={recipient} onChange={setRecipient} />
      <div className="field full">
        <label>Title</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field full">
        <label>Body</label>
        <textarea
          rows={4}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={!recipient.resolved || busy}
      >
        {busy ? 'Sending…' : 'Send Notice'}
      </button>
    </form>
  )
}

// Per-player mail tools (see MailController in the FahhKit backend) - the
// private counterparts to the "publish to everyone" broadcast above:
// gifting one store item, or sending a one-off personal notice. Neither had
// any admin UI before this.
export default function MailToolsPanel() {
  return (
    <div className="mail-tools-panel">
      <GrantItemForm />
      <SendNoticeForm />
    </div>
  )
}
