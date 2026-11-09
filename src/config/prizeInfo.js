// Copy for the "How prizes work" popup (see PrizeInfoPopup.jsx), opened
// from the small "i" icon on every Leaderboard banner slide - the season
// slide and every sponsor partner slide alike. Edit the wording here,
// nowhere else. Deliberately loose - no concrete amounts, odds or
// guarantees, since none of that is actually decided/sourced from a real
// endpoint (same reasoning SeasonPrizeModal.jsx already follows for the
// season banner's own separate popup).
export const PRIZE_INFO_TITLE = 'How to win prizes'

export const PRIZE_INFO_POINTS = [
  'Run, capture and climb: every run you take earns you territory and moves you up the leaderboard.',
  'Finish the season at the top: the top 3 players when the season ends are in the running for exciting prizes from our sponsor partners.',
  "Prizes may vary: rewards come from our partners and can change each season, so keep an eye on the banners for what's on offer.",
]

export const PRIZE_INFO_FOOTER =
  'Terms apply. Prize details are announced by Run Conquest and may change.'

// Optional per-partner override, keyed by the partner's id - give only
// the fields that need to differ (title/points/footer), the rest falls
// back to the shared copy above. Empty by default.
export const PRIZE_INFO_PARTNER_OVERRIDES = {}

// partner is null for the season slide's popup, or { id, name, ... } for
// a sponsor partner slide's.
export function getPrizeInfo(partner) {
  const override = partner?.id ? PRIZE_INFO_PARTNER_OVERRIDES[partner.id] : null
  return {
    title:
      override?.title ||
      (partner ? `Prizes from ${partner.name}` : PRIZE_INFO_TITLE),
    points: override?.points || PRIZE_INFO_POINTS,
    footer: override?.footer || PRIZE_INFO_FOOTER,
  }
}
