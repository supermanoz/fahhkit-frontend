import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import GamePage from './pages/GamePage'
import GameLegalPage from './pages/GameLegalPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import TermsPage from './pages/TermsPage'
import UpdatePasswordPage from './pages/UpdatePasswordPage'
import EditProfilePage from './pages/EditProfilePage'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import ContactPage from './pages/ContactPage'
import PaymentStatusPage from './pages/PaymentStatusPage'
import LiveEventRunPrompt from './components/LiveEventRunPrompt'
import RequireAuth from './components/RequireAuth'
import RequireRole from './components/RequireRole'
import AccessDeniedNotice from './components/AccessDeniedNotice'

// Public storefront - only visited from "Continue to Shop"/the website, so
// it stays out of the main bundle.
const ShopPage = lazy(() => import('./pages/ShopPage'))

// Admin / organiser / account pages: loaded on demand so the website's first
// load (and recharts, used only by the sponsor report) stays small.
const CreateEventPage = lazy(() => import('./pages/CreateEventPage'))
const EditEventPage = lazy(() => import('./pages/EditEventPage'))
const CreateModeratorPage = lazy(() => import('./pages/CreateModeratorPage'))
const ModeratorsPage = lazy(() => import('./pages/ModeratorsPage'))
const EditModeratorPage = lazy(() => import('./pages/EditModeratorPage'))
const AthleteSearchPage = lazy(() => import('./pages/AthleteSearchPage'))
const AthleteProfilePage = lazy(() => import('./pages/AthleteProfilePage'))
const EditAthletePage = lazy(() => import('./pages/EditAthletePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const TrackRunPage = lazy(() => import('./pages/TrackRunPage'))
const RunDetailPage = lazy(() => import('./pages/RunDetailPage'))
const EventRegistrantsPage = lazy(() => import('./pages/EventRegistrantsPage'))
const EventReportPage = lazy(() => import('./pages/EventReportPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const GameMechanicsPage = lazy(() => import('./pages/GameMechanicsPage'))
const FraudFlagsPage = lazy(() => import('./pages/FraudFlagsPage'))
const SponsorReportPage = lazy(() => import('./pages/SponsorReportPage'))

// Every website route (marketing home, events, shop, admin, ...). Lazy-loaded
// from App.jsx and only on the website build: the native app build
// (VITE_APP_SHELL) never imports this file, so none of these pages - or
// their CSS - end up in the Android/iOS bundle.
// Account-only pages need a session: signed out (no, expired or rejected
// token) they redirect to /login?next=<page> and come back after signing in.
// Public: landing, login/register/forgot/update-password, terms, contact,
// the events list + detail, and /game (which has its own in-game sign in).
const guard = (page) => <RequireAuth>{page}</RequireAuth>
// Staff pages: signed in AND the server confirms the role (never localStorage).
// The page - and its lazy chunk - is not even rendered for anyone else; they
// are sent home with a notice. Enforcement is still server-side (SecurityConfig).
const adminOnly = (page) => (
  <RequireAuth>
    <RequireRole allow="admin">{page}</RequireRole>
  </RequireAuth>
)
const staffOnly = (page) => (
  <RequireAuth>
    <RequireRole allow="staff">{page}</RequireRole>
  </RequireAuth>
)

export default function WebShell() {
  return (
    <>
      <LiveEventRunPrompt />
      <AccessDeniedNotice />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/terms/:type" element={<TermsPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route
          path="/update-password/:phone/:password"
          element={<UpdatePasswordPage />}
        />
        <Route path="/profile/edit" element={guard(<EditProfilePage />)} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/create" element={staffOnly(<CreateEventPage />)} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/events/:id/edit" element={staffOnly(<EditEventPage />)} />
        <Route
          path="/events/:id/registrations"
          element={staffOnly(<EventRegistrantsPage />)}
        />
        <Route
          path="/events/:id/report"
          element={staffOnly(<EventReportPage />)}
        />
        <Route
          path="/admin/create-moderator"
          element={adminOnly(<CreateModeratorPage />)}
        />
        <Route path="/admin/dashboard" element={adminOnly(<DashboardPage />)} />
        <Route
          path="/admin/moderators"
          element={adminOnly(<ModeratorsPage />)}
        />
        <Route
          path="/admin/moderators/:id/edit"
          element={adminOnly(<EditModeratorPage />)}
        />
        <Route path="/athletes" element={staffOnly(<AthleteSearchPage />)} />
        <Route
          path="/athletes/:userId"
          element={staffOnly(<AthleteProfilePage />)}
        />
        <Route
          path="/athletes/:userId/edit"
          element={staffOnly(<EditAthletePage />)}
        />
        <Route path="/history" element={guard(<HistoryPage />)} />
        <Route path="/runs" element={<Navigate to="/history" replace />} />
        <Route path="/runs/track" element={guard(<TrackRunPage />)} />
        <Route path="/runs/:id" element={guard(<RunDetailPage />)} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/shop" element={guard(<ShopPage />)} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/game/terms" element={<GameLegalPage doc="terms" />} />
        <Route path="/game/privacy" element={<GameLegalPage doc="privacy" />} />
        <Route
          path="/admin/game-mechanics"
          element={adminOnly(<GameMechanicsPage />)}
        />
        <Route
          path="/admin/fraud-flags"
          element={staffOnly(<FraudFlagsPage />)}
        />
        <Route
          path="/admin/sponsor-report"
          element={staffOnly(<SponsorReportPage />)}
        />
        <Route path="/payment-status" element={guard(<PaymentStatusPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
