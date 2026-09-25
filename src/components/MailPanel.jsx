/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import {
  FaBullhorn,
  FaEnvelope,
  FaEnvelopeOpen,
  FaGift,
  FaUsers,
} from 'react-icons/fa'
import './MailPanel.css'

const TYPE_ICON = {
  NOTICE: FaEnvelope,
  CLUB_INVITE: FaUsers,
  STORE_ITEM_GRANT: FaGift,
}

const STATUS_LABEL = {
  CLAIMED: 'Claimed',
  DECLINED: 'Declined',
}

function formatMailDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isResolved(item) {
  return item.status === 'CLAIMED' || item.status === 'DECLINED'
}

// The in-game inbox. Personal mail and broadcasts (announcements every
// player sees) are separate lists server-side, so they're separate sub-tabs
// here too. Tapping a row expands it and marks it read; claimable mail
// (club invites, gifted items) gets its action buttons in the expanded view.
export default function MailPanel({ mailbox, onClaimed }) {
  const [view, setView] = useState('inbox')
  const [openId, setOpenId] = useState(null)
  const {
    mail,
    broadcasts,
    loaded,
    error,
    busyId,
    actionError,
    open,
    claim,
    decline,
    remove,
    openBroadcast,
  } = mailbox

  const unreadInbox = mail.filter((m) => m.status === 'UNREAD').length
  const unreadNews = broadcasts.filter((b) => !b.readAt).length

  function toggle(item) {
    const next = openId === item.id ? null : item.id
    setOpenId(next)
    if (next) open(item)
  }

  function toggleBroadcast(item) {
    const next = openId === item.id ? null : item.id
    setOpenId(next)
    if (next) openBroadcast(item)
  }

  async function handleClaim(item) {
    const updated = await claim(item)
    if (updated) onClaimed?.(updated)
  }

  return (
    <div className="mail-panel">
      <div className="game-menu-subtabs">
        <button
          type="button"
          className={`game-menu-subtab ${view === 'inbox' ? 'active' : ''}`}
          onClick={() => setView('inbox')}
        >
          Inbox{unreadInbox > 0 ? ` (${unreadInbox})` : ''}
        </button>
        <button
          type="button"
          className={`game-menu-subtab ${view === 'news' ? 'active' : ''}`}
          onClick={() => setView('news')}
        >
          News{unreadNews > 0 ? ` (${unreadNews})` : ''}
        </button>
      </div>

      {error ? (
        <p className="game-menu-empty">{error}</p>
      ) : !loaded ? (
        <p className="game-menu-empty">Checking the mailbox…</p>
      ) : view === 'inbox' ? (
        mail.length === 0 ? (
          <p className="game-menu-empty">
            Inbox zero. Suspiciously peaceful out here. 🕊️
          </p>
        ) : (
          <ul className="game-menu-list mail-list">
            {mail.map((item) => {
              const Icon =
                item.status === 'UNREAD'
                  ? TYPE_ICON[item.type] || FaEnvelope
                  : item.type === 'NOTICE'
                    ? FaEnvelopeOpen
                    : TYPE_ICON[item.type] || FaEnvelope
              const expanded = openId === item.id
              const busy = busyId === item.id
              const claimable = item.type !== 'NOTICE' && !isResolved(item)
              return (
                <li
                  key={item.id}
                  className={`mail-item ${item.status === 'UNREAD' ? 'is-unread' : ''}`}
                >
                  <button
                    type="button"
                    className="game-menu-list-row mail-item-row"
                    onClick={() => toggle(item)}
                    aria-expanded={expanded}
                  >
                    <span className={`mail-item-icon type-${item.type}`}>
                      <Icon />
                    </span>
                    <span className="game-store-item-info">
                      <span className="game-menu-list-area">{item.title}</span>
                      <span className="game-menu-list-meta">
                        {item.senderName || 'Run Conquest'} ·{' '}
                        {formatMailDate(item.createdDate)}
                        {STATUS_LABEL[item.status]
                          ? ` · ${STATUS_LABEL[item.status]}`
                          : ''}
                      </span>
                    </span>
                    {item.status === 'UNREAD' && (
                      <span className="mail-item-dot" aria-label="Unread" />
                    )}
                  </button>

                  {expanded && (
                    <div className="mail-item-body">
                      {item.body && <p>{item.body}</p>}
                      <div className="mail-item-actions">
                        {claimable && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleClaim(item)}
                            disabled={busy}
                          >
                            {busy
                              ? 'Working…'
                              : item.type === 'CLUB_INVITE'
                                ? 'Join Club'
                                : 'Claim Gift'}
                          </button>
                        )}
                        {claimable && item.type === 'CLUB_INVITE' && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => decline(item)}
                            disabled={busy}
                          >
                            Decline
                          </button>
                        )}
                        {/* The backend only lets read/resolved mail be
                            deleted - an unclaimed gift has to be dealt with
                            first. */}
                        {!claimable && item.status !== 'UNREAD' && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => remove(item)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )
      ) : broadcasts.length === 0 ? (
        <p className="game-menu-empty">No announcements right now.</p>
      ) : (
        <ul className="game-menu-list mail-list">
          {broadcasts.map((item) => {
            const expanded = openId === item.id
            return (
              <li
                key={item.id}
                className={`mail-item ${!item.readAt ? 'is-unread' : ''}`}
              >
                <button
                  type="button"
                  className="game-menu-list-row mail-item-row"
                  onClick={() => toggleBroadcast(item)}
                  aria-expanded={expanded}
                >
                  <span className="mail-item-icon type-BROADCAST">
                    <FaBullhorn />
                  </span>
                  <span className="game-store-item-info">
                    <span className="game-menu-list-area">{item.title}</span>
                    <span className="game-menu-list-meta">
                      {item.authorName || 'Run Conquest'} ·{' '}
                      {formatMailDate(item.publishedAt)}
                    </span>
                  </span>
                  {!item.readAt && (
                    <span className="mail-item-dot" aria-label="Unread" />
                  )}
                </button>
                {expanded && item.body && (
                  <div className="mail-item-body">
                    <p>{item.body}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {actionError && (
        <p className="game-controls-hint game-controls-hint-error">
          {actionError}
        </p>
      )}
    </div>
  )
}
