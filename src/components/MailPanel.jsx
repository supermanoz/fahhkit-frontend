/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveFileUrl, toClubRoleWords } from '../api/client'
import {
  IconChevronRight,
  IconEnvelope,
  IconEnvelopeOpen,
  IconGift,
  IconMegaphone,
  IconUsers,
} from './GameIcons'
import './MailPanel.css'
import { playerName } from '../utils/playerName'

const TYPE_ICON = {
  NOTICE: IconEnvelope,
  CLUB_INVITE: IconUsers,
  STORE_ITEM_GRANT: IconGift,
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

// "2d ago" style, for the inbox row's own right-aligned date (News/
// broadcasts keep the absolute formatMailDate above - not asked to change).
function formatRelativeMailDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatMailDate(value)
}

// Today / Yesterday / Earlier, by local calendar day - not a rolling 24h
// window, so a message from 11pm yesterday reads as "Yesterday" even if
// it's only been a couple hours.
function mailDateGroup(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Earlier'
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  return 'Earlier'
}

function isResolved(item) {
  return item.status === 'CLAIMED' || item.status === 'DECLINED'
}

// Neither list has its own scroll box - the whole menu sheet scrolls (see
// GamePage.css's .game-menu-sheet) - so this watches a sentinel row at the
// bottom of the list instead of a scroll-position listener. Fires
// onLoadMore once the sentinel comes within 200px of the viewport; onLoadMore
// itself (useMailbox's loadMoreMail/loadMoreBroadcasts) already no-ops while
// a previous page is still loading, so re-firing mid-load is harmless.
function useLoadMoreSentinel(hasMore, onLoadMore) {
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])
  return sentinelRef
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
    mailPage,
    mailTotalPages,
    loadingMail,
    goToMailPage,
    broadcastHasMore,
    loadingMoreBroadcasts,
    loadMoreBroadcasts,
  } = mailbox

  const unreadInbox = mail.filter((m) => m.status === 'UNREAD').length
  const unreadNews = broadcasts.filter((b) => !b.readAt).length

  // Today/Yesterday/Earlier sections for the inbox list - only ever
  // grouping the current (server-paged) page, same scope "Mark all read"
  // below already operates within.
  const mailGroups = useMemo(() => {
    const buckets = { Today: [], Yesterday: [], Earlier: [] }
    for (const item of mail) buckets[mailDateGroup(item.createdDate)].push(item)
    return ['Today', 'Yesterday', 'Earlier']
      .filter((label) => buckets[label].length > 0)
      .map((label) => ({ label, items: buckets[label] }))
  }, [mail])

  const newsSentinelRef = useLoadMoreSentinel(
    broadcastHasMore,
    loadMoreBroadcasts
  )

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

  // Only a per-item read endpoint exists server-side (see api/mail.js) -
  // no bulk "mark all read" call to make instead, so this is exactly what
  // tapping into every unread row one at a time would do, just fired
  // together. Scoped to the current page, same as the rest of this file's
  // pagination already is.
  function handleMarkAllRead() {
    mail.filter((m) => m.status === 'UNREAD').forEach((item) => open(item))
  }

  return (
    <div className="mail-panel game-cards">
      <section className="game-card game-card-dark mail-panel-card">
        {/* One sticky block (not the header/tabs pinned separately at two
            guessed top offsets) - the menu sheet this lives in is the
            actual scroll container (see useLoadMoreSentinel's own comment
            on why - no list here owns its own scrollbar), and sticky still
            pins against that outer scroll as long as nothing in between
            clips overflow. */}
        <div className="mail-panel-sticky-head">
          <div className="mail-panel-header">
            {view === 'inbox' && unreadInbox > 0 && (
              <button
                type="button"
                className="mail-mark-all-btn"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="mail-tabs" role="tablist" aria-label="Mail">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'inbox'}
              className={`mail-tab ${view === 'inbox' ? 'active' : ''}`}
              onClick={() => setView('inbox')}
            >
              Inbox
              {unreadInbox > 0 && (
                <span className="mail-tab-badge">{unreadInbox}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'news'}
              className={`mail-tab ${view === 'news' ? 'active' : ''}`}
              onClick={() => setView('news')}
            >
              News
              {unreadNews > 0 && (
                <span className="mail-tab-badge">{unreadNews}</span>
              )}
            </button>
          </div>
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
            <>
              {mailGroups.map((group) => (
                <div key={group.label} className="mail-date-group">
                  <p className="mail-date-group-label">{group.label}</p>
                  <ul className="mail-list">
                    {group.items.map((item) => {
                      const Icon =
                        item.status === 'UNREAD'
                          ? TYPE_ICON[item.type] || IconEnvelope
                          : item.type === 'NOTICE'
                            ? IconEnvelopeOpen
                            : TYPE_ICON[item.type] || IconEnvelope
                      const expanded = openId === item.id
                      const busy = busyId === item.id
                      const claimable =
                        item.type !== 'NOTICE' && !isResolved(item)
                      return (
                        <li
                          key={item.id}
                          className={`mail-item ${item.status === 'UNREAD' ? 'is-unread' : 'is-read'}`}
                        >
                          <button
                            type="button"
                            className="mail-item-row"
                            onClick={() => toggle(item)}
                            aria-expanded={expanded}
                          >
                            <span
                              className={`mail-item-icon type-${item.type}`}
                            >
                              <Icon />
                            </span>
                            <span className="mail-item-main">
                              <span className="mail-item-title-row">
                                {item.status === 'UNREAD' && (
                                  <span
                                    className="mail-item-dot"
                                    aria-label="Unread"
                                  />
                                )}
                                <span className="mail-item-title">
                                  {toClubRoleWords(item.title)}
                                </span>
                              </span>
                              <span className="mail-item-source">
                                {playerName(null, item.senderName) ||
                                  'Run Conquest'}
                                {STATUS_LABEL[item.status]
                                  ? ` · ${STATUS_LABEL[item.status]}`
                                  : ''}
                              </span>
                            </span>
                            <span className="mail-item-side">
                              <span className="mail-item-date">
                                {formatRelativeMailDate(item.createdDate)}
                              </span>
                              <IconChevronRight
                                className="mail-item-chevron"
                                aria-hidden="true"
                              />
                            </span>
                          </button>

                          {expanded && (
                            <div className="mail-item-body">
                              {item.body && <p>{toClubRoleWords(item.body)}</p>}
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
                </div>
              ))}
              {/* Same pager control the Me tab uses for My Territories/My
                  Routes (.game-route-pager) - reused here rather than
                  rebuilt, per the brief. 15 mail per page, server-paged
                  (see findMyMail in src/api/mail.js) - each tap replaces
                  the list with that exact page instead of accumulating. */}
              {mailTotalPages > 1 && (
                <div className="game-route-pager">
                  <button
                    type="button"
                    className="game-btn game-btn-wood game-btn-sm"
                    aria-label="Previous page"
                    disabled={mailPage <= 1 || loadingMail}
                    onClick={() => goToMailPage(mailPage - 1)}
                  >
                    ◀
                  </button>
                  <span className="game-route-pager-label">
                    Page {mailPage} of {mailTotalPages}
                  </span>
                  <button
                    type="button"
                    className="game-btn game-btn-wood game-btn-sm"
                    aria-label="Next page"
                    disabled={mailPage >= mailTotalPages || loadingMail}
                    onClick={() => goToMailPage(mailPage + 1)}
                  >
                    ▶
                  </button>
                </div>
              )}
            </>
          )
        ) : broadcasts.length === 0 ? (
          <p className="game-menu-empty">No announcements right now.</p>
        ) : (
          <ul className="news-card-list">
            {broadcasts.map((item) => {
              const expanded = openId === item.id
              return (
                <li
                  key={item.id}
                  className={`news-card ${!item.readAt ? 'is-unread' : ''}`}
                >
                  <button
                    type="button"
                    className="news-card-trigger"
                    onClick={() => toggleBroadcast(item)}
                    aria-expanded={expanded}
                  >
                    {item.imageUrl ? (
                      <span className="news-card-image">
                        <img
                          src={resolveFileUrl(item.imageUrl)}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.parentElement.style.display = 'none'
                          }}
                        />
                      </span>
                    ) : (
                      <span className="news-card-image is-placeholder">
                        <IconMegaphone />
                      </span>
                    )}
                    <span className="news-card-content">
                      <span className="news-card-head">
                        <span className="news-card-title">
                          {toClubRoleWords(item.title)}
                        </span>
                        {!item.readAt && (
                          <span className="mail-item-dot" aria-label="Unread" />
                        )}
                      </span>
                      <span className="news-card-meta">
                        <IconMegaphone aria-hidden="true" /> Admin ·{' '}
                        {formatMailDate(item.publishedAt)}
                      </span>
                    </span>
                  </button>
                  {expanded && item.body && (
                    <div className="news-card-body">
                      <p>{toClubRoleWords(item.body)}</p>
                    </div>
                  )}
                </li>
              )
            })}
            {broadcastHasMore && (
              <li ref={newsSentinelRef} className="mail-list-sentinel">
                {loadingMoreBroadcasts ? 'Loading more…' : ''}
              </li>
            )}
          </ul>
        )}

        {actionError && (
          <p className="game-controls-hint game-controls-hint-error">
            {actionError}
          </p>
        )}
      </section>
    </div>
  )
}
