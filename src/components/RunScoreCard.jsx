/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import './RunScoreCard.css'

// Score breakdown for the run-results toast (see GamePage.jsx's
// runScoreBreakdown) - the backend already computes and pushes this over
// the socket (RunScoreBreakdownResponse, via useGameSocket's onRunProcessed)
// for every scored run, but until now the frontend only ever read it to
// pick a rejection message, never to show the actual numbers. Renders
// nothing for any field the backend left null - a cheat-flagged run never
// gets scored at all, and a PvP race never gets this response shape in the
// first place (it's scored entirely separately - see
// TerritoryProcessingServiceImpl.processCompletedRun). Club War/Boss Fight
// runs only ever populate pace + base effort (no loop, no area/closure),
// which the component list below already handles by just skipping
// whichever fields are null rather than assuming all five are present.
const COMPONENT_LABELS = {
  AREA: 'Area',
  PERIMETER_EFFICIENCY: 'Loop shape',
  PACE: 'Pace',
  CLOSURE_PRECISION: 'Closure',
  BASE_EFFORT: 'Effort',
}

const COUNT_UP_MS = 900

// "New Best" is tracked locally (no backend endpoint for a personal-best
// score exists), scoped per mode since a Club War score isn't comparable
// to a Territory Capture one. Keyed by runId via this component's own
// `key` prop in GamePage.jsx, so each new run's card is a fresh mount and
// this effect runs exactly once per run rather than needing its own guard.
function bestScoreKey(mode) {
  return `fahhkit_best_score_${mode}`
}

export default function RunScoreCard({ breakdown, mode = 'territory' }) {
  const totalScore = breakdown?.totalScore
  const [isNewBest, setIsNewBest] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (totalScore == null) return
    const key = bestScoreKey(mode)
    const raw = localStorage.getItem(key)
    const previousBest = raw ? Number(raw) : null
    if (previousBest == null || totalScore > previousBest) {
      localStorage.setItem(key, String(Math.round(totalScore)))
      // A player's very first scored run of a mode isn't a "new best"
      // worth celebrating - there's nothing yet to have beaten.
      if (previousBest != null) setIsNewBest(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (totalScore == null) return
    let rafId
    const start = performance.now()
    function tick(ts) {
      const t = Math.min(1, (ts - start) / COUNT_UP_MS)
      setCount(Math.round(t * totalScore))
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (totalScore == null) return null

  const components = [
    ['AREA', breakdown.areaComponent],
    ['PERIMETER_EFFICIENCY', breakdown.perimeterEfficiencyComponent],
    ['PACE', breakdown.paceComponent],
    ['CLOSURE_PRECISION', breakdown.closurePrecisionComponent],
    ['BASE_EFFORT', breakdown.baseEffortComponent],
  ].filter(([, value]) => value != null)

  const heroBonus = breakdown.heroBonus

  return (
    <div className="run-score-card">
      <div className="run-score-total-row">
        <span className="run-score-total-label">Score</span>
        <span className="run-score-total-value">{count}</span>
        {isNewBest && <span className="run-score-best-badge">New Best!</span>}
      </div>

      {components.length > 0 && (
        <ul className="run-score-components">
          {components.map(([key, value]) => (
            <li key={key}>
              <span className="run-score-component-label">
                {COMPONENT_LABELS[key] || key}
              </span>
              <span className="run-score-component-value">
                {Math.round(value)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {heroBonus && (
        <p className="run-score-hero-bonus">
          <strong>{heroBonus.heroName}</strong>&apos;s perk added +
          {Math.round(heroBonus.totalBonus)} to this run
        </p>
      )}
    </div>
  )
}
