/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { formatDistance } from '../utils/run'
import './RouteTurnIndicator.css'

// Cartoon turn-by-turn HUD shown while running a saved route (see
// GamePage's handleRunViewedRoute) - a chunky signpost arrow that rotates
// to the turn's relative angle, matching the game's other game-icon/
// ClubTrophyIcon style (thick outline, flat colour, no realism). The map
// itself is already rotated heading-up while tracking (see TerritoryMap's
// isNavigating), so "straight ahead" on the arrow lines up with "up" on
// screen - this never needs the raw compass heading, just the relative
// angle utils/routeNav.js already worked out.

const CUE_COPY = {
  straight: 'Straight ahead',
  'slight-left': 'Bear left',
  'slight-right': 'Bear right',
  left: 'Turn left',
  right: 'Turn right',
  'sharp-left': 'Sharp left',
  'sharp-right': 'Sharp right',
  'off-route': "You're off the route",
  arrived: "You're back! Nice loop 🎉",
}

export default function RouteTurnIndicator({ guidance, onFinish }) {
  if (!guidance) return null

  if (guidance.arrived) {
    return (
      <div className="route-turn-hud route-turn-hud-arrived">
        <span className="route-turn-arrived-badge">🏁</span>
        <div className="route-turn-copy">
          <strong>{CUE_COPY.arrived}</strong>
          <span>End the run to save your territory.</span>
        </div>
        {onFinish && (
          <button
            type="button"
            className="route-turn-finish-btn"
            onClick={onFinish}
          >
            Finish
          </button>
        )}
      </div>
    )
  }

  const { angle, cue, offRoute, distanceToTarget, distanceRemaining } = guidance

  return (
    <div className={`route-turn-hud ${offRoute ? 'is-off-route' : ''}`}>
      <span
        className="route-turn-arrow"
        style={{ transform: `rotate(${offRoute ? 0 : angle}deg)` }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48">
          <path
            d="M24 3 L41 27 H30 V45 H18 V27 H7 Z"
            fill="#ffd34d"
            stroke="#3d2b1a"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="route-turn-copy">
        <strong>{CUE_COPY[cue] || CUE_COPY.straight}</strong>
        <span>
          {offRoute
            ? `Head back to the route to keep going (${formatDistance(distanceRemaining)} left).`
            : `${formatDistance(distanceToTarget)} · ${formatDistance(distanceRemaining)} to go`}
        </span>
      </div>
    </div>
  )
}
