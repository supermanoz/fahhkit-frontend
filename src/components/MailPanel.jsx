/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { mailDisplayBody } from '../utils/mailDetails'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { resolveFileUrl, toClubRoleWords } from '../api/client'
import {
  IconChevronRight,
  IconEnvelope,
  IconEnvelopeOpen,
  IconMegaphone,
  IconTrash,
} from './GameIcons'
import { MAIL_ICONS } from './mailIcons'
import { useToast } from '../game/ui/Toast'
import Badge from '../game/ui/Badge'
import MailDetail from './MailDetail'
import { MailEmpty, MailError, MailSkeleton } from './MailStates'
// The Leaderboard's own row/skeleton recipe (.lb-row) is reused for mail rows.
import './LeaderboardPodium.css'
import './MailPanel.css'
import {
  formatMailDate,
  formatRelativeMailDate,
  groupMailByDate,
  mailPreview,
} from '../utils/mailView'
import {
  mailCategory,
  mailTitle,
  mailTypeClass,
  mailTypeInfo,
} from '../utils/mailTypes'
import {
  MAIL_ACTIONS,
  MAIL_STATUS_LABEL,
  MAIL_TABS,
  NEWS_TAG,
} from '../constants/mailCopy'
import GameButton from './ui/GameButton'

// Neither list has its own scroll box - the whole menu sheet scrolls (see
// GamePage.css's .game-menu-sheet) - so this watches a sentinel row at the
// bottom of the list instead of a scroll-position listener. Fires
// onLoadMore once the sentinel comes within 200px of the viewport;
// onLoadMore itself (useMailbox's loadMoreBroadcasts) already no-ops while a
// previous page is still loading, so re-firing mid-load is harmless.
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

// A message that arrives live (the socket pushes it to the top of the list)
// must not shove what the player is reading off screen. If they are scrolled
// down and new items appear ABOVE the ones that were first, the scroll
// position is moved by exactly the height that was added. At the very top the
// list just grows, so the new message is seen. (The sheet turns off the
// browser's own scroll anchoring on purpose - see .game-menu-sheet.)
function useKeepScrollOnPrepend(containerRef, ids) {
  const last = useRef({ firstId: null, scrollHeight: 0 })
  useLayoutEffect(() => {
    const sheet = containerRef.current?.closest('.game-menu-sheet')
    if (!sheet) return
    const prev = last.current
    const firstId = ids[0] ?? null
    const prependedCount =
      prev.firstId != null && firstId !== prev.firstId
        ? ids.indexOf(prev.firstId)
        : -1
    if (prependedCount > 0 && sheet.scrollTop > 8) {
      const added = sheet.scrollHeight - prev.scrollHeight
      if (added > 0) sheet.scrollTop += added
    }
    last.current = { firstId, scrollHeight: sheet.scrollHeight }
  })
}

// The in-game inbox. Personal mail and broadcasts (announcements every
// player sees) are separate lists server-side, so they're separate tabs
// here too. Tapping a row opens it (and marks it read); claimable mail (club
// invites, gifted items) gets its action buttons in the opened view.
export default function MailPanel({ mailbox, onClaimed, resolveStoreItem }) {
  const [view, setView] = useState('inbox')
  const [openId, setOpenId] = useState(null)
  // Pending confirm popup - { kind: 'single', item } or
  // { kind: 'bulk', count }, null when no popup is showing.
  const [confirmDelete, setConfirmDelete] = useState(null)
  const { push: pushToast } = useToast()
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
    removeAllRead,
    markAllRead,
    openBroadcast,
    refresh,
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
  // How many of the CURRENT page's rows the bulk delete would touch - the
  // real backend op is scoped to the whole inbox (every page), so this is a
  // floor, and the confirm popup says so.
  const readOnPage = mail.filter((m) => m.status !== 'UNREAD').length

  const rootRef = useRef(null)
  const headRef = useRef(null)
  const inboxRef = useRef(null)
  const newsRef = useRef(null)
  // The date labels stick just under the sticky head; tell the CSS how tall
  // that head is right now (it changes with the action row / badges).
  useLayoutEffect(() => {
    const head = headRef.current
    const root = rootRef.current
    if (!head || !root) return undefined
    const apply = () =>
      root.style.setProperty('--mail-head-h', `${head.offsetHeight}px`)
    apply()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(apply)
    observer.observe(head)
    return () => observer.disconnect()
  }, [])
  useKeepScrollOnPrepend(
    view === 'inbox' ? inboxRef : newsRef,
    view === 'inbox' ? mail.map((m) => m.id) : broadcasts.map((b) => b.id)
  )

  useEffect(() => {
    if (!confirmDelete) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setConfirmDelete(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDelete])

  async function handleConfirmDelete() {
    const pending = confirmDelete
    setConfirmDelete(null)
    if (pending.kind === 'single') {
      const ok = await remove(pending.item)
      if (ok) {
        if (openId === pending.item.id) setOpenId(null)
        pushToast('Mail deleted', { type: 'success' })
      } else {
        pushToast("Couldn't delete, try again", { type: 'error' })
      }
      return
    }
    const count = await removeAllRead()
    if (count != null) {
      pushToast(`Deleted ${count} read mail${count === 1 ? '' : 's'}`, {
        type: 'success',
      })
    } else {
      pushToast("Couldn't delete, try again", { type: 'error' })
    }
  }

  const mailGroups = useMemo(() => groupMailByDate(mail), [mail])

  const newsSentinelRef = useLoadMoreSentinel(
    broadcastHasMore,
    loadMoreBroadcasts
  )

  function openMail(item) {
    setOpenId(item.id)
    open(item)
  }

  function openNews(item) {
    setOpenId(item.id)
    openBroadcast(item)
  }

  async function handleClaim(item) {
    const updated = await claim(item)
    if (updated) onClaimed?.(updated)
  }

  // See useMailbox.markAllRead: instant local update, then the per-mail read
  // calls (the server has no bulk endpoint).
  async function handleMarkAllRead() {
    const count = await markAllRead()
    if (count > 0)
      pushToast(`Marked ${count} mail${count === 1 ? '' : 's'} as read`, {
        type: 'success',
      })
  }

  // The open item always comes from the live lists, so a claim/read shows up
  // in the popup the moment the list updates.
  const openMailItem =
    view === 'inbox' ? mail.find((m) => m.id === openId) : null
  const openNewsItem =
    view === 'news' ? broadcasts.find((b) => b.id === openId) : null

  function switchView(next) {
    setView(next)
    setOpenId(null)
  }

  const showingInbox = view === 'inbox'
  const mailTabs = [
    {
      id: 'inbox',
      label: MAIL_TABS.inbox,
      icon: <IconEnvelope aria-hidden="true" />,
      badge: unreadInbox > 0 ? unreadInbox : undefined,
    },
    {
      id: 'news',
      label: MAIL_TABS.news,
      icon: <IconMegaphone aria-hidden="true" />,
      badge: unreadNews > 0 ? unreadNews : undefined,
    },
  ]

  return (
    <div className="mail-panel game-cards" ref={rootRef}>
      <section className="game-card game-card-dark mail-panel-card">
        {/* One sticky block (header actions + tabs): the menu sheet this
            lives in is the scroll container, and sticky pins against it. */}
        <div className="mail-panel-sticky-head" ref={headRef}>
          {/* The Leaderboard's own tab row (same markup/classes as its Top
              Players / Top Clubs switch): selected = filled slate, with the
              unread count inside the tab. */}
          <div
            className="game-menu-subtabs game-shop-tabs game-leaderboard-mode mail-tabs"
            role="tablist"
            aria-label="Mail"
          >
            {mailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                className={`game-menu-subtab ${view === tab.id ? 'active' : ''}`}
                onClick={() => switchView(tab.id)}
              >
                {tab.icon}
                <span className="game-menu-subtab-label">{tab.label}</span>
                {tab.badge != null && (
                  <span className="g-tab-badge">
                    <Badge kind="count">{tab.badge}</Badge>
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Inbox only, below the tabs: two equal secondary buttons. Each is
              muted when it has nothing to do. */}
          {showingInbox && mail.length > 0 && (
            <div className="mail-panel-header">
              <GameButton
                variant="neutral"
                size="sm"
                className="mail-mark-all-btn"
                onClick={handleMarkAllRead}
                disabled={unreadInbox === 0}
              >
                {MAIL_ACTIONS.markAllRead}
              </GameButton>
              <GameButton
                variant="danger"
                size="sm"
                className="mail-delete-read-btn"
                icon={<IconTrash aria-hidden="true" />}
                onClick={() =>
                  setConfirmDelete({ kind: 'bulk', count: readOnPage })
                }
                disabled={readOnPage === 0}
              >
                {MAIL_ACTIONS.deleteRead}
              </GameButton>
            </div>
          )}
        </div>

        {error ? (
          <MailError message={error} onRetry={refresh} />
        ) : !loaded ? (
          <MailSkeleton kind={view} />
        ) : showingInbox ? (
          mail.length === 0 ? (
            <MailEmpty kind="inbox" />
          ) : (
            <div ref={inboxRef} className="g-readable">
              {mailGroups.map((group) => (
                <div key={group.label} className="mail-date-group">
                  <p className="mail-date-group-label">{group.label}</p>
                  <ul className="mail-list">
                    {group.items.map((item) => {
                      const unread = item.status === 'UNREAD'
                      const Icon =
                        !unread && item.type === 'NOTICE'
                          ? IconEnvelopeOpen
                          : MAIL_ICONS[mailTypeInfo(item.type).icon] ||
                            IconEnvelope
                      const preview = mailPreview(
                        toClubRoleWords(mailDisplayBody(item))
                      )
                      return (
                        <li
                          key={item.id}
                          className={`mail-item ${unread ? 'is-unread' : 'is-read'}`}
                        >
                          <button
                            type="button"
                            className="lb-row mail-item-row"
                            onClick={() => openMail(item)}
                            aria-haspopup="dialog"
                          >
                            <span
                              className={`mail-item-icon cat-${mailCategory(item.type)} type-${mailTypeClass(item.type)}`}
                            >
                              <Icon />
                            </span>
                            <span className="mail-item-main">
                              <span className="mail-item-title-row">
                                {unread && (
                                  <span
                                    className="mail-item-dot"
                                    aria-label="Unread"
                                  />
                                )}
                                <span className="mail-item-title">
                                  {toClubRoleWords(mailTitle(item))}
                                </span>
                              </span>
                              {preview && (
                                <span className="mail-item-preview">
                                  {preview}
                                </span>
                              )}
                            </span>
                            <span className="mail-item-side">
                              <span className="mail-item-date">
                                {formatRelativeMailDate(item.createdDate)}
                              </span>
                              {MAIL_STATUS_LABEL[item.status] ? (
                                <span className="mail-item-status">
                                  {MAIL_STATUS_LABEL[item.status]}
                                </span>
                              ) : (
                                <IconChevronRight
                                  className="mail-item-chevron"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
              {/* Same pager control the Me tab uses for My Territories/My
                  Routes (.game-route-pager) - 15 mail per page, server-paged
                  (see findMyMail in src/api/mail.js). */}
              {mailTotalPages > 1 && (
                <div className="game-route-pager">
                  <GameButton
                    variant="neutral"
                    size="sm"
                    aria-label="Previous page"
                    disabled={mailPage <= 1 || loadingMail}
                    onClick={() => goToMailPage(mailPage - 1)}
                  >
                    ◀
                  </GameButton>
                  <span className="game-route-pager-label">
                    Page {mailPage} of {mailTotalPages}
                  </span>
                  <GameButton
                    variant="neutral"
                    size="sm"
                    aria-label="Next page"
                    disabled={mailPage >= mailTotalPages || loadingMail}
                    onClick={() => goToMailPage(mailPage + 1)}
                  >
                    ▶
                  </GameButton>
                </div>
              )}
            </div>
          )
        ) : broadcasts.length === 0 ? (
          <MailEmpty kind="news" />
        ) : (
          <ul className="news-card-list g-readable" ref={newsRef}>
            {broadcasts.map((item) => (
              <NewsCard key={item.id} item={item} onOpen={openNews} />
            ))}
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

      {/* The opened message / news post. Escape or the scrim closes it - unless
          the delete confirm is up, which is closed first. */}
      {openMailItem && (
        <MailDetail
          kind="mail"
          item={openMailItem}
          busy={busyId === openMailItem.id}
          resolveStoreItem={resolveStoreItem}
          onClose={() => !confirmDelete && setOpenId(null)}
          onClaim={handleClaim}
          onDecline={decline}
          onDelete={(item) => setConfirmDelete({ kind: 'single', item })}
        />
      )}
      {openNewsItem && (
        <MailDetail
          kind="news"
          item={openNewsItem}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Delete confirm - same shared overlay/card/actions recipe every other
          confirm step in /game uses. Rendered after the detail popup so it
          sits on top of it. Esc cancels; clicking the overlay cancels. */}
      {confirmDelete && (
        <div
          className="game-confirm-overlay"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="game-confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-label={
              confirmDelete.kind === 'single'
                ? 'Delete this mail?'
                : 'Delete your read mail?'
            }
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDelete.kind === 'single' ? (
              <>
                <p>
                  <strong>Delete this mail?</strong>
                </p>
                <p>This can&apos;t be undone.</p>
              </>
            ) : (
              <>
                <p>
                  <strong>Delete your read mail?</strong>
                </p>
                <p>
                  Every read, claimed or declined mail in your inbox - not just
                  this page (at least {confirmDelete.count} shown here). This
                  can&apos;t be undone.
                </p>
              </>
            )}
            <div className="game-confirm-actions">
              <GameButton
                variant="neutral"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </GameButton>
              <GameButton
                variant="danger"
                className="mail-confirm-delete-btn"
                onClick={handleConfirmDelete}
              >
                Delete
              </GameButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// One news post: banner on top (fixed ratio, with a graceful fallback), tag,
// title, a two-line summary and the date. Tapping it opens the full post.
// There is no link field on a broadcast, so there is no "Read more" link.
function NewsCard({ item, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false)
  const unread = !item.readAt
  const tag = NEWS_TAG[item.type]
  const summary = toClubRoleWords(item.body || '')
  return (
    <li className={`news-card ${unread ? 'is-unread' : ''}`}>
      <button
        type="button"
        className="news-card-trigger"
        onClick={() => onOpen(item)}
        aria-haspopup="dialog"
      >
        <span className="news-card-media">
          {item.imageUrl && !imageFailed ? (
            <img
              decoding="async"
              src={resolveFileUrl(item.imageUrl)}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="news-card-fallback" aria-hidden="true">
              <IconMegaphone />
            </span>
          )}
          {tag && <span className="news-card-tag">{tag}</span>}
        </span>
        <span className="news-card-content">
          <span className="news-card-head">
            {unread && <span className="mail-item-dot" aria-label="Unread" />}
            <span className="news-card-title">
              {toClubRoleWords(item.title)}
            </span>
          </span>
          {summary && <span className="news-card-summary">{summary}</span>}
          <span className="news-card-meta">
            {formatMailDate(item.publishedAt)}
          </span>
        </span>
      </button>
    </li>
  )
}
