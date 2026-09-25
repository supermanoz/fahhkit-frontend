import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  canManageEvents,
  getJson,
  postForm,
  postJson,
  resolveFileUrl,
} from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './CreateEventPage.css'

const EVENT_TYPES = [
  'ENDURANCE',
  'STRENGTH',
  'HYBRID',
  'GYMNASTICS',
  'COMBAT',
  'TEAM',
  'RACKET',
  'OUTDOOR',
  'FLEXIBILITY',
  'PHYSIQUE',
  'RECREATIONAL',
  'RAID',
]

const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']

function toDatetimeLocal(value) {
  return value ? value.slice(0, 16) : ''
}

export default function EditEventPage() {
  const { id } = useParams()
  const { user, loading: userLoading } = useCurrentUser()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [status, setStatus] = useState('')
  const [initialStatus, setInitialStatus] = useState('')
  const [imageUrls, setImageUrls] = useState({ 1: null, 2: null, 3: null })
  const [images, setImages] = useState({ 1: null, 2: null, 3: null })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState(null)

  const allowed = canManageEvents(user)

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    getJson(`/v1/event/${id}`)
      .then((event) => {
        setForm({
          name: event.name || '',
          description: event.description || '',
          venue: event.venue || '',
          date: toDatetimeLocal(event.date),
          entryFee: event.entryFee ?? '',
          capacity: event.capacity ?? '',
          registrationDeadline: toDatetimeLocal(event.registrationDeadline),
          type: event.type || '',
          targetScore: event.targetScore ?? '',
        })
        setStatus(event.status || '')
        setInitialStatus(event.status || '')
        setImageUrls({
          1: event.eventImageUrl1 || null,
          2: event.eventImageUrl2 || null,
          3: event.eventImageUrl3 || null,
        })
      })
      .catch((err) =>
        setBanner({
          kind: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Could not load this event.',
        })
      )
      .finally(() => setLoading(false))
  }, [id, userLoading, allowed])

  if (userLoading) {
    return (
      <div className="create-event-page">
        <Navbar />
        <div className="create-event-wrap">
          <p>Loading...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to={`/events/${id}`} replace />
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleImageChange(slot, e) {
    const file = e.target.files[0] || null
    setImages((prev) => ({ ...prev, [slot]: file }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBanner(null)
    if (!e.target.reportValidity()) return

    setSubmitting(true)
    try {
      await postJson('/v1/event/update', {
        eventId: id,
        ...form,
        entryFee: form.entryFee === '' ? null : Number(form.entryFee),
        capacity: form.capacity === '' ? null : Number(form.capacity),
        targetScore:
          form.type === 'RAID' && form.targetScore !== ''
            ? Number(form.targetScore)
            : null,
      })
      if (status && status !== initialStatus) {
        await postJson('/v1/event/update-status', { eventId: id, status })
      }
      for (const slot of [1, 2, 3]) {
        const file = images[slot]
        if (!file) continue
        const formData = new FormData()
        formData.append('image', file)
        formData.append('slot', slot)
        await postForm(`/v1/event/${id}/upload-image`, formData)
      }
      navigate(`/events/${id}`)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not update the event. Please try again.'
      setBanner({ kind: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="create-event-page">
      <Navbar />
      <div className="create-event-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="create-event-inner">
          <header className="create-event-header" data-aos="fade-down">
            <h1>Edit Event</h1>
            <p>Update the details for this event.</p>
          </header>

          {banner && (
            <div className={`banner ${banner.kind}`}>{banner.message}</div>
          )}
          {loading && <p>Loading...</p>}

          {!loading && form && (
            <form
              className="glass-card"
              onSubmit={handleSubmit}
              noValidate
              data-aos="fade-up"
            >
              <div className="grid">
                <div className="field full">
                  <label htmlFor="name">Event Name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field full">
                  <label htmlFor="description">
                    Description <span className="opt">(optional)</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={form.description}
                    onChange={handleChange}
                  />
                </div>
                <div className="field">
                  <label htmlFor="venue">
                    Venue <span className="opt">(optional)</span>
                  </label>
                  <input
                    id="venue"
                    name="venue"
                    type="text"
                    value={form.venue}
                    onChange={handleChange}
                  />
                </div>
                <div className="field">
                  <label htmlFor="type">Event Type</label>
                  <select
                    id="type"
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select type</option>
                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0) + type.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="date">Event Date &amp; Time</label>
                  <input
                    id="date"
                    name="date"
                    type="datetime-local"
                    value={form.date}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="registrationDeadline">
                    Registration Deadline{' '}
                    <span className="opt">(optional)</span>
                  </label>
                  <input
                    id="registrationDeadline"
                    name="registrationDeadline"
                    type="datetime-local"
                    value={form.registrationDeadline}
                    onChange={handleChange}
                  />
                </div>
                <div className="field">
                  <label htmlFor="entryFee">Entry Fee</label>
                  <input
                    id="entryFee"
                    name="entryFee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.entryFee}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="capacity">
                    Capacity <span className="opt">(optional)</span>
                  </label>
                  <input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min="0"
                    step="1"
                    value={form.capacity}
                    onChange={handleChange}
                  />
                </div>
                {form.type === 'RAID' && (
                  <div className="field">
                    <label htmlFor="targetScore">
                      Raid Boss HP (target score)
                    </label>
                    <input
                      id="targetScore"
                      name="targetScore"
                      type="number"
                      min="1"
                      step="any"
                      value={form.targetScore}
                      onChange={handleChange}
                      required
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    name="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {EVENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend>
                  Event Images <span className="opt">(optional)</span>
                </legend>
                <div className="grid">
                  {[1, 2, 3].map((slot) => (
                    <div className="field" key={slot}>
                      <label htmlFor={`eventImage${slot}`}>Image {slot}</label>
                      {imageUrls[slot] && !images[slot] && (
                        <img
                          src={resolveFileUrl(imageUrls[slot])}
                          alt={`Current event image ${slot}`}
                          className="edit-event-image-preview"
                        />
                      )}
                      <input
                        id={`eventImage${slot}`}
                        name={`eventImage${slot}`}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageChange(slot, e)}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
