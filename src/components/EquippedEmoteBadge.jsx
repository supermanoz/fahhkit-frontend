/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import EmoteGlyph from './EmoteGlyph'
import './EquippedEmoteBadge.css'

// Whichever emote a player has equipped for their active hero, shown next
// to the hero turntable - on their own Me tab (GamePage.jsx) and on
// anyone else's profile (AthleteTerritoryProfilePanel.jsx), same small
// component either way so the two stay visually consistent and a future
// third place (PvP, a run summary, ...) only needs this, not its own
// resolve-the-equipped-item logic. Renders nothing if nothing's equipped
// (most heroes default to the free idle-alias emote, which isn't passed
// here - see each caller's own `.storeItem.category === 'EMOTE'` lookup).
export default function EquippedEmoteBadge({ heroName, emoteName, size = 72 }) {
  if (!heroName || !emoteName) return null
  return (
    <div className="equipped-emote-badge">
      <EmoteGlyph
        heroName={heroName}
        emoteName={emoteName}
        size={size}
        active
      />
      <span className="equipped-emote-badge-label">Equipped Emote</span>
    </div>
  )
}
