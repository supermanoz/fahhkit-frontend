/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import GameButton from '../game/ui/GameButton'
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
export function MailSkeleton({ kind = 'inbox', rows = 4 }) {
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
          </div>
        )
      )}
    </div>
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
