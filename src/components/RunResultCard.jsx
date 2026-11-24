/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { GamePanel, StatChip, StatRow, TitleRibbon } from '../game/ui/GameModal'
import { IconBolt, IconClock, IconRunning } from './GameIcons'
import {
  formatDistance,
  formatDuration,
  formatPace,
  splitUnit,
} from '../utils/run'
import { formatArea } from '../utils/territoryGame'
import {
  TERRITORY_CHECKING,
  postRunModeOf,
  submittedCopy,
} from '../utils/postRun'
import './RunResultCard.css'
import GameButton from './ui/GameButton'

// Distance / pace / time of the finished run - the shared StatChip row.
export function CompletedRunStats({ run }) {
  if (!run) return null
  const distance = splitUnit(formatDistance(run.distance))
  const pace = splitUnit(formatPace(run.avgPace))
  return (
    <StatRow className="run-result-stats">
      <StatChip
        icon={<IconRunning />}
        value={distance.value}
        unit={distance.unit}
        label="Distance"
      />
      <StatChip
        icon={<IconBolt />}
        value={pace.value}
        unit={pace.unit}
        label="Pace"
      />
      <StatChip
        icon={<IconClock />}
        value={formatDuration(run.duration)}
        label="Time"
      />
    </StatRow>
  )
}

// The post-run result popup, for every mode. `runResult.phase`:
//   submitted   Training / PvP / Club War - one terminal state, own wording
//   processing  Conquer only - "Checking your territory..." while the server
//               evaluates the loop
//   rejected    a "no territory" reason, or a cheat flag (all modes)
//   done        Conquer territory result (area gained)
//   timeout     Conquer only - no answer yet
// All copy for the non-territory modes comes from utils/postRun.js.
export default function RunResultCard({
  runResult,
  run,
  warPoints = null,
  summary,
  onClose,
  rollout,
}) {
  const mode = postRunModeOf(run)
  const { phase } = runResult
  let tone = 'info'
  let title = 'Run submitted!'
  let body = null

  if (phase === 'submitted') {
    const copy = submittedCopy(mode, { warPoints })
    title = copy.title
    tone = mode === 'training' ? 'success' : 'info'
    body = copy.note && <p className="run-result-note">{copy.note}</p>
  } else if (phase === 'processing') {
    body = <p className="run-result-note">{TERRITORY_CHECKING}</p>
  } else if (phase === 'rejected') {
    tone = 'warning'
    title = runResult.title
    body = (
      <>
        <p className="run-result-note">{runResult.message}</p>
        {runResult.isRolloutRejection && rollout && (
          <>
            {rollout.result?.alreadyRolledOut && (
              <p className="run-result-note is-soft">
                Looks like it&apos;s already live here - try your next run!
              </p>
            )}
            {rollout.result && !rollout.result.alreadyRolledOut && (
              <p className="run-result-note is-soft">
                Requested - thanks for letting us know!
              </p>
            )}
            {rollout.error && (
              <p className="run-result-note is-error">{rollout.error}</p>
            )}
            {!rollout.result && (
              <GameButton
                variant="neutral"
                disabled={rollout.busy}
                onClick={rollout.onRequest}
              >
                {rollout.busy ? 'Sending…' : 'Request Rollout'}
              </GameButton>
            )}
          </>
        )}
      </>
    )
  } else if (phase === 'done') {
    tone = 'success'
    title = summary?.title || 'Territory updated!'
    body = (
      <p className="run-result-note">
        {formatArea(summary?.totalArea || 0)} affected across{' '}
        {runResult.events.length} update
        {runResult.events.length === 1 ? '' : 's'}
      </p>
    )
  } else if (phase === 'timeout') {
    tone = 'warning'
    title = 'Still checking your territory…'
    body = (
      <p className="run-result-note">
        Taking a bit longer than usual to confirm whether your loop closed -
        check back in a bit if it doesn’t show up here.
      </p>
    )
  }

  // Waiting states have nothing to dismiss yet.
  const dismissLabel =
    phase === 'rejected'
      ? 'Got it'
      : phase === 'timeout'
        ? 'OK'
        : phase === 'processing'
          ? null
          : 'Nice'

  return (
    <GamePanel
      tone={tone}
      className="run-result-card"
      role="dialog"
      aria-live="polite"
      aria-label={title}
    >
      <TitleRibbon tone={tone}>{title}</TitleRibbon>
      <div className="gm-panel-inner has-ribbon run-result-inner">
        <CompletedRunStats run={run} />
        {body}
        {dismissLabel && (
          <GameButton
            variant="neutral"
            className="run-result-ok"
            onClick={onClose}
          >
            {dismissLabel}
          </GameButton>
        )}
      </div>
    </GamePanel>
  )
}
