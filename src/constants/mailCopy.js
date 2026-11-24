// Every word on the Mail page (Inbox / News) in one place - easy to edit.
// Playful but legible: short sentences, nothing that depends on an emoji.

export const MAIL_TABS = Object.freeze({ inbox: 'Inbox', news: 'News' })

export const MAIL_EMPTY = Object.freeze({
  inbox: 'Inbox zero. Suspiciously peaceful out here.',
  news: 'No news yet. Check back soon.',
})

export const MAIL_LOADING = 'Checking the mailbox…'
export const MAIL_RETRY = 'Retry'
export const MAIL_ERROR_HINT = 'Check your connection and try again.'

// Section labels (Today / Yesterday / Earlier - see utils/mailView.js).
export const MAIL_GROUPS = Object.freeze({
  Today: 'Today',
  Yesterday: 'Yesterday',
  Earlier: 'Earlier',
})

// (type labels/icons/tones live in utils/mailTypes.js)
export const MAIL_DEFAULT_SENDER = 'Run Conquest'

// Resolved states shown on a row / in the detail view.
export const MAIL_STATUS_LABEL = Object.freeze({
  CLAIMED: 'Claimed',
  DECLINED: 'Declined',
})

// News: the only tag the data really carries is the broadcast `type`.
export const NEWS_TAG = Object.freeze({ IMPORTANT_NOTICE: 'Important' })
export const NEWS_AUTHOR = 'Admin'

// Detail view actions.
export const MAIL_ACTIONS = Object.freeze({
  claimGift: 'Claim',
  joinClub: 'Join Club',
  decline: 'Decline',
  working: 'Working…',
  close: 'Close',
  deleteRead: 'Delete read',
  markAllRead: 'Mark all read',
})

// Reward chips (what a claimable mail gives).
export const MAIL_REWARD = Object.freeze({
  gift: 'Gift item',
  invite: 'Club invite',
})
