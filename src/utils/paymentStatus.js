// Fahhcoin top-up result shown on /payment-status.
//
// Khalti returns the buyer to OUR BACKEND (/v1/coin-purchase/{id}/payment-
// callback), which verifies the payment server-to-server (Khalti lookup by
// pidx), credits the wallet once, and then 302s the browser to
// /payment-status?purchaseId=..&status=<PAID|PENDING|FAILED|CANCELLED>. The
// page therefore only DISPLAYS the backend's verdict; it never credits or
// verifies anything, so a refresh or a replayed link cannot double-credit.
//
// Khalti's own words (Completed / Pending / Expired / User canceled /
// Refunded ...) are also accepted in case a deployment forwards them.

export const COIN_PAYMENT_KINDS = [
  'PAID',
  'PENDING',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'FAILED',
]

export function normalizeCoinStatus(raw) {
  if (typeof raw !== 'string') return null
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
  if (!s) return null
  if (s === 'paid' || s === 'completed' || s === 'success') return 'PAID'
  if (s === 'pending' || s === 'initiated') return 'PENDING'
  if (s === 'cancelled' || s === 'canceled' || s === 'user canceled')
    return 'CANCELLED'
  if (s === 'expired') return 'EXPIRED'
  if (s === 'refunded' || s === 'partially refunded') return 'REFUNDED'
  if (s === 'failed' || s === 'failure') return 'FAILED'
  return null
}

export const COIN_STATUS_CONTENT = {
  PAID: {
    kind: 'success',
    title: 'Fahhcoin added!',
    message: 'Your payment went through and your balance is topped up.',
  },
  PENDING: {
    kind: 'success',
    title: 'Payment pending',
    message:
      "We're still confirming your payment with Khalti. This can take a moment. Your Fahhcoin will be added once it is confirmed, so please do not pay again.",
  },
  FAILED: {
    kind: 'error',
    title: "Payment didn't go through",
    message:
      'Your payment could not be completed and no Fahhcoin was added. You can try again below.',
  },
  CANCELLED: {
    kind: 'error',
    title: 'Payment cancelled',
    message:
      'You cancelled the payment before it completed. No money was taken. You can try again below.',
  },
  EXPIRED: {
    kind: 'error',
    title: 'Payment link expired',
    message:
      'The payment was not completed in time and the link expired. You can start a new purchase below.',
  },
  REFUNDED: {
    kind: 'error',
    title: 'Payment refunded',
    message:
      'This payment was refunded by Khalti, so no Fahhcoin was added. You can start a new purchase below.',
  },
}

// "Return to the game" for the phone browser the payment ran in. The native
// app registers this scheme (Info.plist / AndroidManifest); opening it just
// brings the app forward, and GamePage's resume handler then refreshes the
// balance. No account data travels in the link.
export const GAME_APP_SCHEME_URL = 'runconquest://payment-return'
