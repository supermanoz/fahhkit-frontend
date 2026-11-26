/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import GameButton from '../game/ui/GameButton'
import { GameModal } from '../game/ui/GameModal'
import mailInboxIcon from '../assets/ui/mail_inbox.png'
import {
  MAIL_EMPTY,
  MAIL_ERROR_HINT,
  MAIL_LOADING,
  MAIL_RETRY,
} from '../constants/mailCopy'

// The winged envelope (the same asset the Inbox tab used to carry), drawn in a
// soft purple disc as the page's one illustration.
export function MailIllustration() {
  return (
    <span className="mail-illustration" aria-hidden="true">
      <span
        className="mail-illustration-art"
        style={{
          WebkitMaskImage: `url(${mailInboxIcon})`,
          maskImage: `url(${mailInboxIcon})`,
        }}
      />
    </span>
  )
}

// Rows shaped like the real ones, so nothing jumps when mail arrives.
// 6 rows fill a phone screen under the tabs; each mirrors .mail-item-row
// (icon badge | title + preview | time).
export const MAIL_SKELETON_ROWS = 6
export function MailSkeleton({ kind = 'inbox', rows = MAIL_SKELETON_ROWS }) {
  return (
    <div
      className="mail-skeleton"
      role="status"
      aria-live="polite"
      aria-label={MAIL_LOADING}
      data-testid="mail-skeleton"
    >
      {Array.from({ length: rows }, (_, i) =>
        kind === 'news' ? (
          <div key={i} className="mail-skel-news">
            <span className="mail-skel-block mail-skel-banner" />
            <span className="mail-skel-block mail-skel-line" />
            <span className="mail-skel-block mail-skel-line is-short" />
          </div>
        ) : (
          <div key={i} className="mail-skel-row">
            <span className="mail-skel-block mail-skel-circle" />
            <span className="mail-skel-lines">
              <span className="mail-skel-block mail-skel-line" />
              <span className="mail-skel-block mail-skel-line is-short" />
            </span>
            <span className="mail-skel-block mail-skel-time" />
          </div>
        )
      )}
    </div>
  )
}

// The mail popup while its message is still being fetched: title ribbon,
// chips, body lines and the action button, in the real popup's order.
export function MailDetailSkeleton({ onClose }) {
  return (
    <GameModal
      open
      onClose={onClose}
      tone="info"
      title=" "
      className="mail-detail"
      overlayClassName="mail-detail-overlay"
    >
      <div
        className="mail-detail-skeleton"
        role="status"
        aria-live="polite"
        aria-label={MAIL_LOADING}
        data-testid="mail-detail-skeleton"
      >
        <div className="mail-detail-chips">
          <span className="mail-skel-block mail-skel-chip" />
          <span className="mail-skel-block mail-skel-chip" />
        </div>
        <div className="mail-detail-body">
          <span className="mail-skel-block mail-skel-line" />
          <span className="mail-skel-block mail-skel-line" />
          <span className="mail-skel-block mail-skel-line is-short" />
        </div>
        <span className="mail-skel-block mail-skel-action" />
      </div>
    </GameModal>
  )
}

export function MailEmpty({ kind = 'inbox' }) {
  return (
    <div className="mail-state mail-empty" role="status">
      <MailIllustration />
      <p className="mail-state-title">{MAIL_EMPTY[kind]}</p>
    </div>
  )
}

export function MailError({ message, onRetry }) {
  return (
    <div className="mail-state mail-error" role="alert">
      <MailIllustration />
      <p className="mail-state-title">{message}</p>
      <p className="mail-state-hint">{MAIL_ERROR_HINT}</p>
      {onRetry && (
        <GameButton variant="success" size="lg" onClick={onRetry}>
          {MAIL_RETRY}
        </GameButton>
      )}
    </div>
  )
}
