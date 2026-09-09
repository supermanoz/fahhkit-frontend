import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AOS from 'aos'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import UpdatePasswordPage from './pages/UpdatePasswordPage'
import EditProfilePage from './pages/EditProfilePage'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import CreateEventPage from './pages/CreateEventPage'
import EditEventPage from './pages/EditEventPage'
import CreateModeratorPage from './pages/CreateModeratorPage'
import ModeratorsPage from './pages/ModeratorsPage'
import EditModeratorPage from './pages/EditModeratorPage'
import AthleteSearchPage from './pages/AthleteSearchPage'
import AthleteProfilePage from './pages/AthleteProfilePage'
import EditAthletePage from './pages/EditAthletePage'
import HistoryPage from './pages/HistoryPage'
import TrackRunPage from './pages/TrackRunPage'
import RunDetailPage from './pages/RunDetailPage'
import ContactPage from './pages/ContactPage'
import PaymentStatusPage from './pages/PaymentStatusPage'
import EventRegistrantsPage from './pages/EventRegistrantsPage'
import EventReportPage from './pages/EventReportPage'
import DashboardPage from './pages/DashboardPage'
import GamePage from './pages/GamePage'
import LiveEventRunPrompt from './components/LiveEventRunPrompt'

export default function App() {
  useEffect(() => {
    AOS.init({ duration: 700, once: true, offset: 40 })
  }, [])

  return (
    <>
      <LiveEventRunPrompt />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
        <Route
          path="/update-password/:phone/:password"
          element={<UpdatePasswordPage />}
        />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/create" element={<CreateEventPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/events/:id/edit" element={<EditEventPage />} />
        <Route
          path="/events/:id/registrations"
          element={<EventRegistrantsPage />}
        />
        <Route path="/events/:id/report" element={<EventReportPage />} />
        <Route
          path="/admin/create-moderator"
          element={<CreateModeratorPage />}
        />
        <Route path="/admin/dashboard" element={<DashboardPage />} />
        <Route path="/admin/moderators" element={<ModeratorsPage />} />
        <Route
          path="/admin/moderators/:id/edit"
          element={<EditModeratorPage />}
        />
        <Route path="/athletes" element={<AthleteSearchPage />} />
        <Route path="/athletes/:userId" element={<AthleteProfilePage />} />
        <Route path="/athletes/:userId/edit" element={<EditAthletePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/runs" element={<Navigate to="/history" replace />} />
        <Route path="/runs/track" element={<TrackRunPage />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/payment-status" element={<PaymentStatusPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
