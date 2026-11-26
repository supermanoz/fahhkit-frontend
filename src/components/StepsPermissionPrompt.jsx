/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Modal } from '../game/ui/Panel'
import GameButton from './ui/GameButton'

// Our own one-screen explanation BEFORE the system dialog (asked only when a
// run starts / Indoor is picked, and only once - see utils/stepsPermission.js).
// "Not now" never blocks the run.
export default function StepsPermissionPrompt({ onAllow, onSkip }) {
  return (
    <Modal title="Count your steps?" onClose={onSkip}>
      <p className="training-start-copy">
        Allow motion access so Run Conquest can count your steps and distance
        during a run. It only reads your step count - nothing else - and you can
        run without it.
      </p>
      <div className="training-start-actions">
        <GameButton variant="primary" fullWidth onClick={onAllow}>
          Continue
        </GameButton>
        <GameButton variant="neutral" fullWidth onClick={onSkip}>
          Not now
        </GameButton>
      </div>
    </Modal>
  )
}
