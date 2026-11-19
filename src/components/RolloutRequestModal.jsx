/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Modal } from '../game/ui/Panel'
import GameButton from '../game/ui/GameButton'
import './RolloutRequestModal.css'

// Shown once per game open when the player is positively outside a
// rolled-out area (see useRolloutStatus.js). While outside, the game itself
// is halted and greyed out (GamePage.jsx's rollout lock) - this popup just
// explains why; the persistent banner over the map stays after it's closed.
export default function RolloutRequestModal({ onDismiss }) {
  return (
    <Modal
      title="Run Conquest isn't available in your area yet"
      onClose={onDismiss}
    >
      <p className="rollout-modal-body">
        We&rsquo;re rolling out city by city.
      </p>
      <div className="rollout-modal-actions">
        <GameButton
          variant="secondary"
          onClick={onDismiss}
          className="g-full-width"
        >
          OK
        </GameButton>
      </div>
    </Modal>
  )
}
