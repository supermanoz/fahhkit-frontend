// Centres `card` inside its horizontal scroll `track` WITHOUT touching any
// ancestor scroller. element.scrollIntoView() scrolls every scrollable
// ancestor, so a carousel at the top of a scrolling panel (the Leaderboard)
// dragged the whole panel back up to itself on every auto-advance, which read
// as "the list won't scroll".
export function centerCardInTrack(track, card, smooth = true) {
  if (!track || !card) return
  const left = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2
  const target = Math.max(0, left)
  if (typeof track.scrollTo === 'function') {
    track.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' })
  } else {
    track.scrollLeft = target
  }
}
