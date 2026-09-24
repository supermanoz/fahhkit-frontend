import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError, getJson, isAdmin, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import {
  EMAIL_PATTERN,
  EMAIL_TITLE,
  NAME_PATTERN,
  NAME_TITLE,
} from '../constants/validation'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './CreateModeratorPage.css'

export default function EditModeratorPage() {
  const { id } = useParams()
  const { user, loading: userLoading } = useCurrentUser()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    if (userLoading || !isAdmin(user)) {
      setLoading(false)
      return
    }
    getJson(`/v1/user/moderator/${id}`)
      .then((data) => {
        setForm({
          fullName: data.fullName || '',
          email: data.email || '',
          gender: data.gender || '',
          birthDate: data.birthDate || '',
          address: data.address || '',
        })
        setStatus(data.status || 'ACTIVE')
      })
      .catch((err) =>
        setBanner({
          kind: 'error',
          message:
            err instanceof ApiError
              ? err.message
              : 'Could not load this moderator.',
        })
      )
      .finally(() => setLoading(false))
  }, [id, userLoading, user])

  if (userLoading) {
    return (
      <div className="create-moderator-page">
        <Navbar />
        <div className="create-moderator-wrap">
          <p>Loading...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!isAdmin(user)) {
    return <Navigate to="/" replace />
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBanner(null)
    if (!e.target.reportValidity()) return

    setSubmitting(true)
    try {
      await postJson('/v1/user/moderator/update', { id, ...form })
      navigate('/admin/moderators', {
        state: { message: 'Moderator details updated.' },
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not update this moderator. Please try again.'
      setBanner({ kind: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLockToggle() {
    setBanner(null)
    setDisabling(true)
    const locking = status !== 'LOCKED'
    try {
      await postJson(locking ? '/v1/user/lock' : '/v1/user/unlock', {
        userId: id,
      })
      navigate('/admin/moderators', {
        state: {
          message: locking ? 'Moderator disabled.' : 'Moderator enabled.',
        },
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : `Could not ${locking ? 'disable' : 'enable'} this moderator. Please try again.`
      setBanner({ kind: 'error', message })
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div className="create-moderator-page">
      <Navbar />
      <div className="create-moderator-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="create-moderator-inner">
          <header className="create-moderator-header" data-aos="fade-down">
            <h1>Edit Moderator</h1>
            <p>Update this moderator&apos;s details.</p>
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
              <fieldset>
                <legend>Personal Details</legend>
                <div className="grid">
                  <div className="field full">
                    <label htmlFor="fullName">Full Name</label>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      pattern={NAME_PATTERN}
                      title={NAME_TITLE}
                      value={form.fullName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      pattern={EMAIL_PATTERN}
                      title={EMAIL_TITLE}
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="gender">Gender</label>
                    <select
                      id="gender"
                      name="gender"
                      value={form.gender}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHERS">Others</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="birthDate">Date of Birth</label>
                    <input
                      id="birthDate"
                      name="birthDate"
                      type="date"
                      value={form.birthDate}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="address">Address</label>
                    <input
                      id="address"
                      name="address"
                      type="text"
                      value={form.address}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </fieldset>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                type="button"
                className="btn btn-outline btn-block"
                style={{ marginTop: 12 }}
                onClick={handleLockToggle}
                disabled={disabling}
              >
                {status === 'LOCKED'
                  ? disabling
                    ? 'Enabling...'
                    : 'Enable Moderator'
                  : disabling
                    ? 'Disabling...'
                    : 'Disable Moderator'}
              </button>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
