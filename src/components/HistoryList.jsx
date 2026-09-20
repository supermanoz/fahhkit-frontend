/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Link } from 'react-router-dom'
import { EVENT_TYPE_LABELS, formatDate } from '../utils/events'
import { formatDistance, formatDuration, formatPace } from '../utils/run'
import RunThumbnailMap from './RunThumbnailMap' // TEMP — testing only, remove when told to
import './HistoryList.css'

const STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

const PAYMENT_STATUS_LABELS = {
  PAID: 'Payment Paid',
  PENDING: 'Payment Pending',
  FAILED: 'Payment Failed',
  CANCELLED: 'Payment Cancelled',
}

export default function HistoryList({
  history,
  emptyMessage = 'No run history yet.',
}) {
  const entries = history || []

  if (entries.length === 0) {
    return <p className="history-empty">{emptyMessage}</p>
  }

  return (
    <div className="history-list">
      {entries.map((item) => (
        <div className="history-item" key={item.registrationId}>
          <div className="history-item-main">
            <span className="history-item-type">
              {EVENT_TYPE_LABELS[item.eventType] || item.eventType}
            </span>
            <h3>{item.eventName}</h3>
            <dl className="history-item-meta">
              <div>
                <dt>Event Date</dt>
                <dd>{formatDate(item.eventDate)}</dd>
              </div>
              {item.venue && (
                <div>
                  <dt>Venue</dt>
                  <dd>{item.venue}</dd>
                </div>
              )}
              <div>
                <dt>Registered On</dt>
                <dd>{formatDate(item.registeredDate)}</dd>
              </div>
            </dl>
          </div>

          {item.run && (
            <div className="history-item-run">
              <RunThumbnailMap runId={item.run.id} />
              <dl className="history-item-run-stats">
                <div>
                  <dt>Distance</dt>
                  <dd>{formatDistance(item.run.distance)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(item.run.duration)}</dd>
                </div>
                <div>
                  <dt>Pace</dt>
                  <dd>{formatPace(item.run.avgPace)}</dd>
                </div>
              </dl>
              <Link to={`/runs/${item.run.id}`} className="btn btn-outline">
                View Run
              </Link>
            </div>
          )}

          <div className="history-item-badges">
            <span
              className={`history-item-status status-${(item.eventStatus || '').toLowerCase()}`}
            >
              {STATUS_LABELS[item.eventStatus] || item.eventStatus}
            </span>
            {item.paymentStatus && (
              <span
                className={`history-item-payment payment-${item.paymentStatus.toLowerCase()}`}
              >
                {PAYMENT_STATUS_LABELS[item.paymentStatus] ||
                  item.paymentStatus}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
