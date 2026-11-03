import heroIcon from '../assets/ui/hero_icon.png'

// The 40px round icon every Club War member row shows next to a name - the
// live roster (ClubWarPanel.jsx's squadList, reused as-is at 28px by the
// pre-war matchup preview) and the past-war breakdown (ClubWarHistory.jsx).
// One flat icon for every member, not a per-hero portrait - no hero lookup,
// no broken-image fallback chain needed.
export default function ClubWarMemberAvatar() {
  return <img src={heroIcon} alt="" loading="lazy" width={40} height={40} />
}
