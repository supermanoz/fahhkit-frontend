/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { motion } from 'framer-motion'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconMegaphone,
} from './GameIcons'
import { resolveFileUrl, toClubRoleWords } from '../api/client'
import { openExternal } from '../utils/externalLink'
import { safeHref } from '../utils/safeUrl'
import './BroadcastPrompt.css'

// News/announcement broadcasts, front and center the moment the game opens
// (see GamePage's useAnnouncementNotices). Look only - what is shown, when,
// and what "Got it"/X/Esc/backdrop do (dismiss = permanent, per broadcast id)
// is unchanged. With several unread ones they are shown one at a time: the
// arrows / swipe / dots only move between them, "Got it" dismisses the one on
// screen and the next takes its place; the popup closes when none are left.
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g
const SWIPE_PX = 48

function linkify(text) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        className="bcast-link"
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => openExternal(part, e)}
      >
        {part}
      </a>
    ) : (
      part
    )
  )
}

function formatWhen(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BroadcastPrompt({ notices, onDismiss }) {
  const [index, setIndex] = useState(0)
  const lastShown = useRef(null)
  const count = notices.length
  const safeIndex = Math.min(index, Math.max(count - 1, 0))
  // While the popup animates out the queue is already empty - keep drawing
  // the last broadcast so it doesn't collapse mid-fade.
  const broadcast = notices[safeIndex] || lastShown.current
  if (notices[safeIndex]) lastShown.current = notices[safeIndex]

  const dismissCurrent = useCallback(() => {
    if (notices[safeIndex]) onDismiss(notices[safeIndex].id)
  }, [notices, safeIndex, onDismiss])

  const go = useCallback(
    (delta) => {
      if (count < 2) return
      setIndex((safeIndex + delta + count) % count)
    },
    [count, safeIndex]
  )

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') dismissCurrent()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissCurrent, go])

  // Fade at the bottom of a long message only while there is more to scroll.
  const scrollRef = useRef(null)
  const [fade, setFade] = useState(false)
  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  }, [])
  useLayoutEffect(() => {
    measure()
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [broadcast?.id, measure])

  const swipe = useRef(null)
  function onPointerDown(e) {
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerUp(e) {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
      go(dx < 0 ? 1 : -1)
    }
  }

  if (!broadcast) return null
  const title = toClubRoleWords(broadcast.title || '').trim()
  const body = toClubRoleWords(broadcast.body || '')
  const linkUrl = broadcast.linkUrl || broadcast.url || broadcast.link
  const when = formatWhen(broadcast.publishedAt)
  const isNew = !broadcast.readAt

  return (
    <motion.div
      className="bcast-backdrop"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={dismissCurrent}
    >
      <motion.div
        className="bcast-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bcast-title"
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.16, ease: 'easeIn' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="bcast-banner">
          <span className="bcast-badge" aria-hidden="true">
            <IconMegaphone />
          </span>
          <span className="bcast-banner-title">Broadcast</span>
          {isNew && <span className="bcast-new">NEW</span>}
        </div>
        <button
          type="button"
          className="game-close-btn bcast-close"
          onClick={dismissCurrent}
          aria-label="Close"
        >
          <IconClose />
        </button>

        <div className="bcast-content" key={broadcast.id}>
          {title && (
            <h3 id="bcast-title" className="bcast-title">
              {title}
            </h3>
          )}
          <div
            ref={scrollRef}
            className={`bcast-scroll${fade ? ' has-fade' : ''}`}
            onScroll={measure}
            tabIndex={0}
            aria-label="Message"
          >
            {broadcast.imageUrl && (
              <img
                className="bcast-image"
                src={resolveFileUrl(broadcast.imageUrl)}
                alt=""
                onLoad={measure}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  measure()
                }}
              />
            )}
            {body && <p className="bcast-body">{linkify(body)}</p>}
          </div>
          {when && <p className="bcast-when">{when}</p>}
        </div>

        {count > 1 && (
          <div className="bcast-pager">
            <button
              type="button"
              className="bcast-arrow"
              onClick={() => go(-1)}
              aria-label="Previous broadcast"
            >
              <IconChevronLeft />
            </button>
            <div className="bcast-dots" aria-hidden="true">
              {notices.map((n, i) => (
                <span
                  key={n.id}
                  className={`bcast-dot${i === safeIndex ? ' is-on' : ''}`}
                />
              ))}
            </div>
            <span className="bcast-counter">
              {safeIndex + 1}/{count}
            </span>
            <button
              type="button"
              className="bcast-arrow"
              onClick={() => go(1)}
              aria-label="Next broadcast"
            >
              <IconChevronRight />
            </button>
          </div>
        )}

        <div className="bcast-actions">
          {linkUrl && (
            <a
              className="game-btn game-btn-wood bcast-open"
              href={safeHref(linkUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openExternal(linkUrl, e)}
            >
              Open
            </a>
          )}
          <button
            type="button"
            className="game-btn game-btn-green bcast-got-it"
            onClick={dismissCurrent}
          >
            Got it
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
