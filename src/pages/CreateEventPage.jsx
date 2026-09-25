import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError, canManageEvents, postForm } from '../api/client'
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
  // Co-op "boss" event: every registrant's run score chips away at targetScore.
  'RAID',
]

const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']

const INITIAL_FORM = {
  name: '',
  description: '',
  venue: '',
  date: '',
  entryFee: '',
  capacity: '',
  registrationDeadline: '',
  type: '',
  status: '',
  targetScore: '',
}

export default function CreateEventPage() {
  const { user, loading: userLoading } = useCurrentUser()
  const [form, setForm] = useState(INITIAL_FORM)
  const [images, setImages] = useState({
    eventImage1: null,
    eventImage2: null,
    eventImage3: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState(null)
  const navigate = useNavigate()

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

  if (!canManageEvents(user)) {
    return <Navigate to="/events" replace />
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleImageChange(e) {
    const { name, files } = e.target
    setImages((prev) => ({ ...prev, [name]: files[0] || null }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBanner(null)
    if (!e.target.reportValidity()) return

    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      // targetScore only means anything for a RAID event.
      if (key === 'targetScore' && form.type !== 'RAID') return
      if (value.trim() !== '') formData.append(key, value)
    })
    Object.entries(images).forEach(([key, file]) => {
      if (file) formData.append(key, file)
    })

    setSubmitting(true)
    try {
      await postForm('/v1/event/save', formData)
      navigate('/events')
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not create the event. Please try again.'
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
            <h1>Create Event</h1>
            <p>Set up a new club event or race.</p>
          </header>

          {banner && (
            <div className={`banner ${banner.kind}`}>{banner.message}</div>
          )}

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
                  Registration Deadline <span className="opt">(optional)</span>
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
                <label htmlFor="status">
                  Status{' '}
                  <span className="opt">(optional, defaults to Draft)</span>
                </label>
                <select
                  id="status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                >
                  <option value="">Select status</option>
                  {EVENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0) + status.slice(1).toLowerCase()}
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
                <div className="field">
                  <label htmlFor="eventImage1">Image 1</label>
                  <input
                    id="eventImage1"
                    name="eventImage1"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                </div>
                <div className="field">
                  <label htmlFor="eventImage2">Image 2</label>
                  <input
                    id="eventImage2"
                    name="eventImage2"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                </div>
                <div className="field">
                  <label htmlFor="eventImage3">Image 3</label>
                  <input
                    id="eventImage3"
                    name="eventImage3"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                </div>
              </div>
            </fieldset>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Event'}
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
