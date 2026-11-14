/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect } from 'react'
import { Modal } from '../game/ui/Panel'
import GameButton from '../game/ui/GameButton'
import './RolloutRequestModal.css'
import { formatNumber } from '../utils/format'

const AUTO_CLOSE_MS = 2000

// Task 2's proactive "territory capture isn't available here yet" popup.
// Shown once per game open (see useRolloutStatus.js) - never over the
// loading splash, never more than once a session once dismissed. Reused
// as-is for the reactive TERRITORY_NOT_ROLLED_OUT path too (GamePage.jsx),
// so there is exactly one rollout-request UI, not two.
export default function RolloutRequestModal({
  cityName,
  countryName,
  requestCount,
  submitting,
  submitError,
  justRequested,
  onRequest,
  onDismiss,
}) {
  const regionName =
    cityName && countryName
      ? `${cityName}, ${countryName}`
      : cityName || 'your area'

  useEffect(() => {
    if (!justRequested) return
    const timeout = setTimeout(onDismiss, AUTO_CLOSE_MS)
    return () => clearTimeout(timeout)
  }, [justRequested, onDismiss])

  return (
    <Modal
      title="Territory capture isn't available in your region yet"
      onClose={onDismiss}
    >
      {justRequested ? (
        <div
          className="rollout-modal-success"
          onClick={onDismiss}
          role="presentation"
        >
          <p className="rollout-modal-success-text">
            Request sent <span aria-hidden="true">✓</span>
            <br />
            We&rsquo;ll notify you when {regionName} goes live.
          </p>
        </div>
      ) : (
        <>
          <p className="rollout-modal-body">
            We&rsquo;re rolling out region by region. Request it for{' '}
            <strong>{regionName}</strong> and we&rsquo;ll let you know when
            it&rsquo;s live.
            {typeof requestCount === 'number' && requestCount > 0 && (
              <span className="rollout-modal-count">
                {' '}
                {formatNumber(requestCount)}{' '}
                {requestCount === 1 ? 'player has' : 'players have'} already
                asked.
              </span>
            )}
          </p>
          {submitError && (
            <p className="rollout-modal-error" role="alert">
              {submitError}
            </p>
          )}
          <div className="rollout-modal-actions">
            <GameButton
              variant="primary"
              loading={submitting}
              onClick={onRequest}
              className="g-full-width"
            >
              {submitError ? 'Retry' : 'Request Rollout'}
            </GameButton>
            <GameButton
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="g-full-width"
            >
              Maybe Later
            </GameButton>
          </div>
        </>
      )}
    </Modal>
  )
}
