/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { Modal } from '../game/ui/Panel'
import GameButton from './ui/GameButton'
import './TrainingStartSheet.css'
import {
  TRAINING_KIND,
  loadTrainingKind,
  saveTrainingKind,
} from '../utils/trainingKind'

// Training's start screen: Outdoor (GPS, today's behaviour) or Indoor
// (treadmill: no GPS, no map). The last choice is remembered.
const OPTIONS = [
  { kind: TRAINING_KIND.OUTDOOR, label: 'Outdoor' },
  { kind: TRAINING_KIND.INDOOR, label: 'Indoor (treadmill)' },
]

const COPY = {
  [TRAINING_KIND.OUTDOOR]:
    'Run with GPS and the map. Practice only - no territory is claimed.',
  [TRAINING_KIND.INDOOR]:
    'No GPS and no map: a timer and your steps. At the end you confirm the distance from the treadmill display. Practice only - no territory.',
}

export default function TrainingStartSheet({ onStart, onClose }) {
  const [kind, setKind] = useState(loadTrainingKind)
  const pick = (k) => {
    setKind(k)
    saveTrainingKind(k)
  }
  return (
    <Modal title="Training" onClose={onClose} className="training-start">
      <div
        className="training-seg"
        role="radiogroup"
        aria-label="Where are you training?"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={kind === o.kind}
            className={`training-seg-btn${kind === o.kind ? ' is-on' : ''}`}
            onClick={() => pick(o.kind)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="training-start-copy">{COPY[kind]}</p>
      <div className="training-start-actions">
        <GameButton variant="primary" fullWidth onClick={() => onStart(kind)}>
          Start
        </GameButton>
        <GameButton variant="neutral" fullWidth onClick={onClose}>
          Cancel
        </GameButton>
      </div>
    </Modal>
  )
}
