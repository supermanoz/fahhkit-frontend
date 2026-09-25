import { Link } from 'react-router-dom'
import { EVENT_TYPE_LABELS, formatDate } from '../utils/events'
import { resolveFileUrl } from '../api/client'
import './NextEventBanner.css'

function randomPhotoFor(event) {
  const seed = encodeURIComponent(event.id ?? event.name ?? 'fahhkit-event')
  return `https://picsum.photos/seed/${seed}/1600/700`
}

export function eventToSlide(event, isNext) {
  const image = event.eventImageUrl1
    ? resolveFileUrl(event.eventImageUrl1)
    : randomPhotoFor(event)

  return {
    image,
    content: (
      <div className="next-event-inner">
        {!isNext && <span className="next-event-tag">Upcoming</span>}
        <span className="next-event-type">
          {EVENT_TYPE_LABELS[event.type] || event.type}
        </span>
        <h2 className="next-event-title">{event.name}</h2>
        <p className="next-event-meta">
          {formatDate(event.date)}
          {event.venue ? ` · ${event.venue}` : ''}
        </p>
        <Link to={`/events/${event.id}`} className="btn btn-primary btn-lg">
          View Details
        </Link>
      </div>
    ),
  }
}
