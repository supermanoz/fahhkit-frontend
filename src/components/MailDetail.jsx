/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { GameActions, GameModal } from '../game/ui/GameModal'
import GameButton from '../game/ui/GameButton'
import { resolveFileUrl, toClubRoleWords } from '../api/client'
import { openExternal } from '../utils/externalLink'
import { formatMailDateTime, splitLinks } from '../utils/mailView'
import { mailDisplayBody, mailFacts } from '../utils/mailDetails'
import { getDisplayName } from '../utils/playerName'
import {
  IconCheck,
  IconEnvelope,
  IconGift,
  IconMegaphone,
  IconTrash,
  IconUsers,
} from './GameIcons'
import { MAIL_ICONS } from './mailIcons'
import { isMailClaimable, mailTitle, mailTypeInfo } from '../utils/mailTypes'
import {
  MAIL_ACTIONS,
  MAIL_DEFAULT_SENDER,
  MAIL_REWARD,
  MAIL_STATUS_LABEL,
  NEWS_AUTHOR,
  NEWS_TAG,
} from '../constants/mailCopy'

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
  const info = mailTypeInfo(item.type)
  const title = toClubRoleWords(mailTitle(item))

  let Icon = isNews ? IconMegaphone : MAIL_ICONS[info.icon] || IconEnvelope
  let typeLabel = isNews ? NEWS_TAG[item.type] || 'News' : info.label
  const sender = isNews
    ? NEWS_AUTHOR
    : getDisplayName(
        {
          id: item.senderId,
          nickname: item.senderNickname,
          fullName: item.senderName,
        },
        MAIL_DEFAULT_SENDER
      )
  const when = formatMailDateTime(isNews ? item.publishedAt : item.createdDate)
  const facts = isNews ? [] : mailFacts(item)
  // Only types that really have a claim action (never unknown/read-only ones).
  const claimable = !isNews && isMailClaimable(item)

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
      tone={isNews ? 'info' : info.tone}
      title={title}
      className="mail-detail"
      overlayClassName="mail-detail-overlay"
    >
      {isNews && item.imageUrl && !imageFailed && (
        <span className="mail-detail-banner">
          <img
            loading="lazy"
            decoding="async"
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
        <Body text={isNews ? item.body : mailDisplayBody(item)} />
      </div>

      {facts.length > 0 && (
        <dl className="mail-detail-facts" data-testid="mail-facts">
          {facts.map((f) => (
            <div key={f.label} className="mail-fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

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
        {/* A personal mail keeps only Delete (+ Claim when there is something
            to claim); tapping outside the card or Escape closes it. */}
        {isNews && (
          <GameButton
            variant="secondary"
            className="g-full-width"
            onClick={onClose}
          >
            {MAIL_ACTIONS.close}
          </GameButton>
        )}
        {!isNews && (
          // Always offered once the mail is no longer UNREAD (the backend's own
          // rule - see api/mail.js's deleteMail); deleting never claims or
          // declines an invite/gift. Disabled while still UNREAD.
          <GameButton
            variant="danger"
            className="g-full-width mail-delete-btn"
            icon={<IconTrash aria-hidden="true" />}
            onClick={() => onDelete?.(item)}
            disabled={busy || item.status === 'UNREAD'}
            title={
              item.status === 'UNREAD' ? 'Open this mail first' : undefined
            }
            aria-label="Delete mail"
          >
            Delete
          </GameButton>
        )}
      </GameActions>
    </GameModal>
  )
}
