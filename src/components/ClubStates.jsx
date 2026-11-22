/* eslint-disable react/prop-types -- no prop-types dependency in this project */

// Plain-language error with a Retry button, shared by every Club screen.
export function ClubError({ message, onRetry }) {
  return (
    <div className="club-state" role="alert">
      <p className="club-state-title">Something went wrong</p>
      <p className="club-state-text">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="game-btn game-btn-wood"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  )
}
