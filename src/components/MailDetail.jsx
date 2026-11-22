/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { GameActions, GameModal } from '../game/ui/GameModal'
import GameButton from '../game/ui/GameButton'
import { resolveFileUrl, toClubRoleWords } from '../api/client'
import { openExternal } from '../utils/externalLink'
import { formatMailDateTime, splitLinks } from '../utils/mailView'
import { playerName } from '../utils/playerName'
import {
  IconCheck,
  IconEnvelope,
  IconGift,
  IconMegaphone,
  IconTrash,
  IconUsers,
} from './GameIcons'
import {
  MAIL_ACTIONS,
  MAIL_DEFAULT_SENDER,
  MAIL_REWARD,
  MAIL_STATUS_LABEL,
  MAIL_TYPE_FALLBACK,
  MAIL_TYPE_LABEL,
  NEWS_AUTHOR,
  NEWS_TAG,
} from '../constants/mailCopy'

const TYPE_ICON = {
  NOTICE: IconEnvelope,
  CLUB_INVITE: IconUsers,
  STORE_ITEM_GRANT: IconGift,
}
// Ribbon colour by what the mail is.
const TYPE_TONE = {
  NOTICE: 'info',
  CLUB_INVITE: 'success',
  STORE_ITEM_GRANT: 'warning',
}

// Body text: paragraphs on blank lines, http(s) links styled and safe (only
// URLs that pass utils/safeUrl.js become anchors).
function Body({ text }) {
  const paragraphs = toClubRoleWords(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return paragraphs.map((paragraph, i) => (
    <p key={i} className="mail-detail-text">
      {splitLinks(paragraph).map((part, j) =>
        part.type === 'link' ? (
          <a
            key={j}
            className="mail-detail-link"
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternal(part.href, e)}
          >
            {part.value}
          </a>
        ) : (
          <span key={j}>{part.value}</span>
        )
      )}
    </p>
  ))
}

// The open message / news post, as a popup (title ribbon, chips, body, reward
// chips, actions). `kind`: 'mail' (personal inbox item) | 'news' (broadcast).
export default function MailDetail({
  kind = 'mail',
  item,
  busy = false,
  resolveStoreItem,
  onClose,
  onClaim,
  onDecline,
  onDelete,
}) {
  const [imageFailed, setImageFailed] = useState(false)
  if (!item) return null
  const isNews = kind === 'news'
  const title = toClubRoleWords(item.title || '')

  let Icon = isNews ? IconMegaphone : TYPE_ICON[item.type] || IconEnvelope
  let typeLabel = isNews
    ? NEWS_TAG[item.type] || 'News'
    : MAIL_TYPE_LABEL[item.type] || MAIL_TYPE_FALLBACK
  const sender = isNews
    ? NEWS_AUTHOR
    : playerName(null, item.senderName) || MAIL_DEFAULT_SENDER
  const when = formatMailDateTime(isNews ? item.publishedAt : item.createdDate)
  const resolved = item.status === 'CLAIMED' || item.status === 'DECLINED'
  const claimable = !isNews && item.type !== 'NOTICE' && !resolved

  // What claiming gives, from fields the mail really has: a gift's store item
  // (named from the already-loaded catalog when it is there), or a club invite.
  let reward = null
  if (!isNews && item.type === 'STORE_ITEM_GRANT') {
    const storeItem = resolveStoreItem?.(item.attachment?.refId)
    reward = { Icon: IconGift, label: storeItem?.name || MAIL_REWARD.gift }
  } else if (!isNews && item.type === 'CLUB_INVITE') {
    reward = { Icon: IconUsers, label: MAIL_REWARD.invite }
  }

  return (
    <GameModal
      open
      onClose={onClose}
      tone={isNews ? 'info' : TYPE_TONE[item.type] || 'info'}
      title={title}
      className="mail-detail"
      overlayClassName="mail-detail-overlay"
    >
      {isNews && item.imageUrl && !imageFailed && (
        <span className="mail-detail-banner">
          <img
            src={resolveFileUrl(item.imageUrl)}
            alt=""
            onError={() => setImageFailed(true)}
          />
        </span>
      )}

      <div className="mail-detail-chips">
        <span className="mail-chip is-type">
          <Icon aria-hidden="true" /> {typeLabel}
        </span>
        <span className="mail-chip">{sender}</span>
        {when && <span className="mail-chip">{when}</span>}
        {!isNews && MAIL_STATUS_LABEL[item.status] && (
          <span className="mail-chip is-status">
            <IconCheck aria-hidden="true" /> {MAIL_STATUS_LABEL[item.status]}
          </span>
        )}
      </div>

      <div className="mail-detail-body">
        <Body text={item.body} />
      </div>

      {reward && (
        <div className="mail-detail-rewards" aria-label="What you get">
          <span className="mail-reward-chip">
            <reward.Icon aria-hidden="true" /> {reward.label}
          </span>
        </div>
      )}

      <GameActions stacked>
        {claimable && (
          <GameButton
            variant="success"
            size="lg"
            className="g-full-width"
            onClick={() => onClaim?.(item)}
            disabled={busy}
          >
            {busy
              ? MAIL_ACTIONS.working
              : item.type === 'CLUB_INVITE'
                ? MAIL_ACTIONS.joinClub
                : MAIL_ACTIONS.claimGift}
          </GameButton>
        )}
        {claimable && item.type === 'CLUB_INVITE' && (
          <GameButton
            variant="secondary"
            className="g-full-width"
            onClick={() => onDecline?.(item)}
            disabled={busy}
          >
            {MAIL_ACTIONS.decline}
          </GameButton>
        )}
        <GameButton
          variant={claimable ? 'ghost' : 'secondary'}
          className="g-full-width"
          onClick={onClose}
        >
          {MAIL_ACTIONS.close}
        </GameButton>
        {!isNews && (
          // Always offered once the mail is no longer UNREAD (the backend's own
          // rule - see api/mail.js's deleteMail); deleting never claims or
          // declines an invite/gift. Disabled while still UNREAD.
          <button
            type="button"
            className="mail-delete-btn"
            onClick={() => onDelete?.(item)}
            disabled={busy || item.status === 'UNREAD'}
            title={
              item.status === 'UNREAD' ? 'Open this mail first' : undefined
            }
            aria-label="Delete mail"
          >
            <IconTrash aria-hidden="true" /> Delete
          </button>
        )}
      </GameActions>
    </GameModal>
  )
}
