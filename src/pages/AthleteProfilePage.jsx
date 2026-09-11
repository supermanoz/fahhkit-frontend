import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiError,
  canManageEvents,
  getJson,
  postJson,
  resolveFileUrl,
} from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { COUNTRY_LABELS } from '../constants/countries'
import { formatName } from '../utils/format'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import HistoryList from '../components/HistoryList'
import './AthleteProfilePage.css'

const GENDER_LABELS = { MALE: 'Male', FEMALE: 'Female', OTHERS: 'Others' }

export default function AthleteProfilePage() {
  const { userId } = useParams()
  const { user, isAuthed, loading: userLoading } = useCurrentUser()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const allowed = isAuthed && canManageEvents(user)

  useEffect(() => {
    if (userLoading || !allowed) {
      setLoading(false)
      return
    }
    Promise.all([
      getJson(`/v1/user/${userId}/details`),
      postJson(`/v1/athlete/${userId}/history`, {
        pageNumber: 1,
        noOfRecords: 500,
      }),
    ])
      .then(([profileData, historyData]) => {
        setProfile(profileData)
        setHistory(historyData?.content || [])
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load this athlete. Please try again.'
        )
      )
      .finally(() => setLoading(false))
  }, [userLoading, allowed, userId])

  if (!userLoading && !allowed) {
    return (
      <div className="athlete-profile-page">
        <Navbar />
        <div className="athlete-profile-wrap">
          <div className="banner error">
            {isAuthed ? (
              "You don't have permission to view this page."
            ) : (
              <>
                <Link to="/login">Sign in</Link> as a moderator to view athlete
                profiles.
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="athlete-profile-page">
      <Navbar />
      <div className="athlete-profile-wrap">
        <div className="athlete-profile-top">
          <p className="athlete-profile-back">
            <Link to="/athletes">&larr; Back to search</Link>
          </p>
          {profile && (
            <Link to={`/athletes/${userId}/edit`} className="btn btn-outline">
              Edit Athlete
            </Link>
          )}
        </div>

        {error && <div className="banner error">{error}</div>}
        {loading && <p className="athlete-profile-muted">Loading...</p>}

        {!loading && profile && (
          <>
            <header
              className="athlete-profile-header glass-card"
              data-aos="fade-up"
            >
              <span className="athlete-profile-avatar">
                {profile.profilePictureUrl ? (
                  <img
                    src={resolveFileUrl(profile.profilePictureUrl)}
                    alt={profile.fullName}
                  />
                ) : (
                  (profile.fullName || '?').charAt(0).toUpperCase()
                )}
              </span>
              <div>
                <h1>{formatName(profile.fullName)}</h1>
                <p>{profile.email}</p>
                <p>{profile.mobileNumber}</p>
              </div>
            </header>

            <div className="athlete-profile-grid">
              <div
                className="glass-card athlete-profile-section"
                data-aos="fade-up"
              >
                <h2>Personal Details</h2>
                <dl>
                  <div>
                    <dt>Gender</dt>
                    <dd>{GENDER_LABELS[profile.gender] || '—'}</dd>
                  </div>
                  <div>
                    <dt>Date of Birth</dt>
                    <dd>{profile.birthDate || '—'}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{profile.address || '—'}</dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>{profile.joinedDate || '—'}</dd>
                  </div>
                </dl>
              </div>

              <div
                className="glass-card athlete-profile-section"
                data-aos="fade-up"
              >
                <h2>Athlete Details</h2>
                <dl>
                  <div>
                    <dt>Nationality</dt>
                    <dd>{profile.nationality || '—'}</dd>
                  </div>
                  <div>
                    <dt>Country</dt>
                    <dd>
                      {COUNTRY_LABELS[profile.country] ||
                        profile.country ||
                        '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>City</dt>
                    <dd>{profile.city || '—'}</dd>
                  </div>
                  <div>
                    <dt>Occupation</dt>
                    <dd>{profile.occupation || '—'}</dd>
                  </div>
                  <div>
                    <dt>Blood Group</dt>
                    <dd>{profile.bloodGroup || '—'}</dd>
                  </div>
                </dl>
              </div>

              <div
                className="glass-card athlete-profile-section"
                data-aos="fade-up"
              >
                <h2>Emergency Contact</h2>
                <dl>
                  <div>
                    <dt>Name</dt>
                    <dd>{profile.emergencyContactName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Relationship</dt>
                    <dd>{profile.emergencyContactRelationship || '—'}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{profile.emergencyContactPhone || '—'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <section className="athlete-profile-history">
              <h2>Run History</h2>
              <HistoryList
                history={history}
                emptyMessage="This athlete hasn't registered for any events yet."
              />
            </section>
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
