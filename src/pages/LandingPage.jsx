import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Carousel from '../components/Carousel'
import SectionTitle from '../components/SectionTitle'
import { eventToSlide } from '../components/NextEventBanner'
import SponsorCarousel from '../components/SponsorCarousel'
import TeamCarousel from '../components/TeamCarousel'
import Footer from '../components/Footer'
import { getJson } from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import bannerImage from '../assets/images/Fahhkit-Banner.jfif'
import sundayRundayImage from '../assets/images/Sunday-Runday.jfif'
import foundingMembersImage from '../assets/images/founding-members.jfif'
import territoryRunImage from '../assets/images/territory-run-teaser.svg'
import manojBasnetPhoto from '../assets/images/team/manojbasnet.jfif'
import aryanDahalPhoto from '../assets/images/team/aryandahal.jfif'
import aryanShahPhoto from '../assets/images/team/aryanshah.jfif'
import rajPhoto from '../assets/images/team/raj.png'
import riteshChandPhoto from '../assets/images/team/riteshchand.jpeg'
import jojanRaiPhoto from '../assets/images/team/jojanrai.jpeg'
import './LandingPage.css'

// A signed-in visitor is already a member - sending them to /register from
// this slide would just dump them on a signup form for an account they have.
function getSlides(isAuthed) {
  return [
    {
      image: bannerImage,
      title: 'Fahhkit Fitness Club',
      subtitle: 'Say f**k it and get it done!',
      cta: isAuthed ? (
        <Link to="/events" className="btn btn-white btn-lg">
          View Events
        </Link>
      ) : (
        <Link to="/register" className="btn btn-white btn-lg">
          Join the Club
        </Link>
      ),
    },
    {
      image: sundayRundayImage,
      title: 'Sunday Runday',
      subtitle: 'Happens every Sunday at 5pm, Cafe Bizarre',
      cta: (
        <Link to="/events" className="btn btn-white btn-lg">
          View Events
        </Link>
      ),
    },
    {
      image: territoryRunImage,
      title: 'Territory Run',
      subtitle:
        'Run a loop, claim the ground, defend it from the crew. Play it now.',
      cta: (
        <Link to="/game" className="btn btn-white btn-lg">
          Play Territory Run
        </Link>
      ),
    },
  ]
}

// Fallback shown only if /v1/event/accomplishment fails to load — keeps the
// section from looking broken, not meant to reflect real numbers.
const FALLBACK_MILESTONES = [
  { number: '—', label: 'Members Joined' },
  { number: '—', label: 'Events Hosted' },
  { number: '—', label: 'KM Logged Together' },
  { number: '—', label: 'Months Running Strong' },
]

function formatKm(km) {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}K+`
  return `${Math.round(km)}+`
}

function accomplishmentToMilestones(data) {
  return [
    { number: `${data.joinedMembers}+`, label: 'Members Joined' },
    { number: `${data.hostedEvents}+`, label: 'Events Hosted' },
    { number: formatKm(data.kmLogged || 0), label: 'KM Logged Together' },
    { number: `${data.runningMonths}+`, label: 'Months Running Strong' },
  ]
}

const TEAM = [
  {
    name: 'Manoj Basnet',
    role: 'Co-Founder & Head Coach',
    photo: manojBasnetPhoto,
    bio: "Started FahhKit with a single Sunday run and hasn't missed one since. Believes every workout should feel like showing up for your friends.",
  },
  {
    name: 'Aryan Dahal',
    role: 'Co-Founder & Marketing Head',
    photo: aryanDahalPhoto,
    bio: 'Plans the routes, sets the pace, and makes sure nobody gets left behind — literally or figuratively.',
  },
  {
    name: 'Raj Karki',
    role: 'Co-Founder & Events Coordinator',
    photo: rajPhoto,
    bio: 'Turns "say fk it" into an actual race day — venues, logistics, and snacks all sorted.',
  },
  {
    name: 'Jojan Rai',
    role: 'Co-Founder & Developer',
    photo: jojanRaiPhoto,
    bio: 'Builds the app that powers the "say fk it" moment — from the run tracker to the sign-up flow.',
  },
  {
    name: 'Aryan Shah',
    role: 'Co-Founder & Community Lead',
    photo: aryanShahPhoto,
    bio: 'The friendly face who welcomes every new member and keeps the group chat alive between events.',
  },
  {
    name: 'Ritesh Chand',
    role: 'Co-Founder & Team Member',
    photo: riteshChandPhoto,
    bio: 'Shows up rain or shine and brings the energy that keeps the crew moving.',
  },
]

export default function LandingPage() {
  const { isAuthed } = useCurrentUser()
  const [events, setEvents] = useState([])
  const [milestones, setMilestones] = useState(FALLBACK_MILESTONES)
  const location = useLocation()
  const navigate = useNavigate()
  const [banner, setBanner] = useState(
    location.state?.message
      ? { kind: 'success', message: location.state.message }
      : null
  )

  useEffect(() => {
    getJson('/v1/event/upcoming')
      .then((data) => setEvents((data || []).slice(0, 3)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    getJson('/v1/event/accomplishment')
      .then((data) => setMilestones(accomplishmentToMilestones(data)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (location.state?.message) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!banner) return
    const timer = setTimeout(() => setBanner(null), 5000)
    return () => clearTimeout(timer)
  }, [banner])

  const slides = [
    ...events.map((event, i) => eventToSlide(event, i === 0)),
    ...getSlides(isAuthed),
  ]

  return (
    <div className="landing">
      <Navbar />

      {banner && (
        <div className="section-inner">
          <div className={`banner ${banner.kind}`}>{banner.message}</div>
        </div>
      )}

      <Carousel slides={slides} />

      <SponsorCarousel />

      <section id="about" className="milestones">
        <div className="section-inner milestones-inner">
          <div className="milestones-content" data-aos="fade-right">
            <SectionTitle
              eyebrow="Our Journey So Far"
              title="What We've Accomplished Together"
              subtitle="From a handful of weekend runners to a community that shows up, every single time."
            />
            <p className="milestones-text">
              FahhKit started as a small Sunday run and grew into a full-blown
              fitness community — one race, one workout, and one &quot;say fk
              it&quot; moment at a time.
            </p>
            <div className="milestones-stats">
              {milestones.map((m) => (
                <div className="milestone-stat" key={m.label}>
                  <span className="milestone-number">{m.number}</span>
                  <span className="milestone-label">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="milestones-image" data-aos="fade-left">
            <img src={foundingMembersImage} alt="FahhKit founding members" />
          </div>
        </div>
      </section>

      <section id="team" className="team-section">
        <div className="section-inner">
          <SectionTitle
            eyebrow="The People Behind FahhKit"
            title="Meet Our Team"
            subtitle="The crew who show up every week to keep the community running."
          />
          <div data-aos="fade-up">
            <TeamCarousel team={TEAM} />
          </div>
        </div>
      </section>

      <section className="cta-band">
        <span className="blob cta-blob-a" aria-hidden="true" />
        <span className="blob cta-blob-b" aria-hidden="true" />
        <div className="section-inner cta-inner" data-aos="zoom-in">
          <div>
            <h2>
              {isAuthed ? 'Ready for your next run?' : 'Ready to run with us?'}
            </h2>
            <p>
              {isAuthed
                ? "See what's on the calendar and get signed up."
                : 'Registration takes less than two minutes.'}
            </p>
          </div>
          <div className="cta-actions">
            {isAuthed ? (
              <Link to="/events" className="btn btn-primary btn-lg">
                View Events
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg">
                  Sign Up
                </Link>
                <Link to="/login" className="btn btn-outline btn-lg">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
