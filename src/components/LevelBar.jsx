/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { levelProgress } from '../utils/territoryGame'

// The Clash Royale-style level meter from the main HUD - burst badge with
// the level number, bar flush against it, optional name riding the bar's top
// edge. Shared so the HUD, the Me tab and other players' profiles all show
// level the same way (styles: .game-hud-level-* in GamePage.css). showXp
// prints "into / span XP" inside the bar, for the bigger profile version.
export default function LevelBar({ level, xp, name, showXp = false }) {
  const { into, span, pct } = levelProgress(level, xp ?? 0)
  return (
    <>
      <span className="game-hud-level-badge">
        <span className="game-hud-level-num">{level}</span>
      </span>
      <div className="game-hud-level-track">
        {name && <span className="game-hud-level-name">{name}</span>}
        <div className="game-hud-level-bar">
          <div
            className="game-hud-level-bar-fill"
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
          {showXp && (
            <span className="game-hud-level-xp">
              {into} / {span} XP
            </span>
          )}
        </div>
      </div>
    </>
  )
}
