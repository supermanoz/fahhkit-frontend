/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import './RolloutRequestedChip.css'

// Task 2 requirement 4: once the player has already requested rollout for
// their region, the game never shows the popup again - just this small,
// non-blocking chip, tappable for a one-line detail instead of a full modal
// (there's nothing actionable left to show - the request is already in).
export default function RolloutRequestedChip({ cityName, countryName }) {
  const [expanded, setExpanded] = useState(false)
  const regionName =
    cityName && countryName
      ? `${cityName}, ${countryName}`
      : cityName || 'your area'

  return (
    <button
      type="button"
      className="rollout-chip"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
    >
      <span className="rollout-chip-label">
        Rollout requested for {regionName}
      </span>
      {expanded && (
        <span className="rollout-chip-detail">
          We&rsquo;ll notify you when it goes live.
        </span>
      )}
    </button>
  )
}
