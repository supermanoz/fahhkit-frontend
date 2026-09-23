import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError, isAdmin, postJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import {
  EMAIL_PATTERN,
  EMAIL_TITLE,
  NAME_PATTERN,
  NAME_TITLE,
  PHONE_PATTERN,
  PHONE_TITLE,
} from '../constants/validation'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './CreateModeratorPage.css'

const INITIAL_FORM = {
  fullName: '',
  email: '',
  mobileNumber: '',
  gender: '',
  birthDate: '',
  address: '',
}

export default function CreateModeratorPage() {
  const { user, loading: userLoading } = useCurrentUser()
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState(null)
  const navigate = useNavigate()

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

    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value.trim() !== '')
    )
    payload.userType = 'MODERATOR'

    setSubmitting(true)
    try {
      await postJson('/v1/user/create-moderator', payload)
      setForm(INITIAL_FORM)
      navigate('/admin/moderators', {
        state: {
          message: `${form.fullName} has been added as a moderator — we've emailed them a password to sign in with.`,
        },
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not create moderator. Please try again.'
      setBanner({ kind: 'error', message })
    } finally {
      setSubmitting(false)
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
            <h1>Add a Moderator</h1>
            <p>Fill out the form below to grant someone moderator access</p>
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
                  <label htmlFor="mobileNumber">Mobile Number</label>
                  <input
                    id="mobileNumber"
                    name="mobileNumber"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98XXXXXXXX"
                    pattern={PHONE_PATTERN}
                    title={PHONE_TITLE}
                    value={form.mobileNumber}
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

            <p className="hint">
              A temporary password will be generated and emailed to them
              automatically.
            </p>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
            >
              {submitting ? 'Adding Moderator...' : 'Add Moderator'}
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
