import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FaEnvelopeOpenText } from 'react-icons/fa'
import { ApiError, getJson, postJson } from '../api/client'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './PaymentStatusPage.css'

const STATUS_CONTENT = {
  PAID: {
    kind: 'success',
    title: "You're registered!",
    message: 'Your payment was successful and your spot is confirmed.',
  },
  PENDING: {
    kind: 'success',
    title: 'Payment pending',
    message:
      "We're still confirming your payment with Khalti. This can take a moment — check back shortly.",
  },
  FAILED: {
    kind: 'error',
    title: "Payment didn't go through",
    message: 'Your payment could not be completed. You can try again below.',
  },
  CANCELLED: {
    kind: 'error',
    title: 'Payment cancelled',
    message:
      'You cancelled the payment before it completed. You can try again below.',
  },
}

// Fahhcoin top-ups (CoinPurchaseController) share this same redirect page
// with event registration payments, but resolve to a `purchaseId` +
// `status` pair instead of a `registrationId` — and the coin-purchase
// backend has no GET-by-id lookup, so the already-resolved `status` query
// param is all there is to show here (no follow-up fetch needed/possible).
const COIN_STATUS_CONTENT = {
  PAID: {
    kind: 'success',
    title: 'Fahhcoin added!',
    message: 'Your payment went through and your balance is topped up.',
  },
  PENDING: {
    kind: 'success',
    title: 'Payment pending',
    message:
      "We're still confirming your payment with Khalti. This can take a moment — check back shortly.",
  },
  FAILED: {
    kind: 'error',
    title: "Payment didn't go through",
    message: 'Your payment could not be completed. You can try again below.',
  },
  CANCELLED: {
    kind: 'error',
    title: 'Payment cancelled',
    message:
      'You cancelled the payment before it completed. You can try again below.',
  },
}

export default function PaymentStatusPage() {
  const [searchParams] = useSearchParams()
  const registrationId = searchParams.get('registrationId')
  const purchaseId = searchParams.get('purchaseId')
  const coinStatus = searchParams.get('status')
  const [registration, setRegistration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(null)
  const [showEmailPopup, setShowEmailPopup] = useState(false)

  useEffect(() => {
    // Coin-purchase redirects carry everything needed (status) in the URL
    // itself - nothing to fetch, just stop the "checking..." spinner.
    if (purchaseId) {
      setLoading(false)
      return
    }
    if (!registrationId) {
      setError('Missing registration details.')
      setLoading(false)
      return
    }
    getJson(`/v1/event/registration/${registrationId}`)
      .then((data) => {
        setRegistration(data)
        // The backend fires the registration-confirmation email itself the
        // moment a registration turns PAID — this just lets the athlete know
        // it happened, since Khalti's redirect back here is otherwise silent.
        if (data.paymentStatus === 'PAID') setShowEmailPopup(true)
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your registration status.'
        )
      )
      .finally(() => setLoading(false))
  }, [registrationId, purchaseId])

  async function handleRetry() {
    setRetryError(null)
    setRetrying(true)
    try {
      const data = await postJson(
        `/v1/event/registration/${registrationId}/initiate-payment`
      )
      window.location.href = data.paymentUrl
    } catch (err) {
      setRetryError(
        err instanceof ApiError
          ? err.message
          : 'Could not start payment. Please try again.'
      )
      setRetrying(false)
    }
  }

  const content = registration
    ? STATUS_CONTENT[registration.paymentStatus]
    : null
  const coinContent = purchaseId ? COIN_STATUS_CONTENT[coinStatus] : null

  return (
    <div className="payment-status-page">
      <Navbar />

      {showEmailPopup && (
        <div className="email-sent-popup-overlay">
          <div className="email-sent-popup glass-card">
            <span className="email-sent-popup-icon">
              <FaEnvelopeOpenText />
            </span>
            <h2>Confirmation email sent!</h2>
            <p>
              We&apos;ve emailed you the details for{' '}
              {registration?.eventName || 'your event'} — check your inbox (and
              spam folder, just in case).
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setShowEmailPopup(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="payment-status-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="payment-status-card glass-card" data-aos="fade-up">
          {loading && (
            <p className="payment-status-muted">
              Checking your payment status...
            </p>
          )}
          {error && <div className="banner error">{error}</div>}

          {!loading && purchaseId && coinContent && (
            <>
              <h1>{coinContent.title}</h1>
              <p>{coinContent.message}</p>

              <dl className="payment-status-meta">
                <div>
                  <dt>Purchase</dt>
                  <dd>Fahhcoin top-up</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{coinStatus}</dd>
                </div>
              </dl>

              <div className="payment-status-actions">
                <Link to="/game" className="btn btn-primary">
                  Back to Territory Run
                </Link>
              </div>
            </>
          )}

          {!loading && purchaseId && !coinContent && (
            <div className="banner error">
              Could not resolve that payment&apos;s status.
            </div>
          )}

          {!loading && registration && content && (
            <>
              <h1>{content.title}</h1>
              <p>{content.message}</p>

              <dl className="payment-status-meta">
                <div>
                  <dt>Event</dt>
                  <dd>{registration.eventName}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{registration.paymentStatus}</dd>
                </div>
              </dl>

              {retryError && <div className="banner error">{retryError}</div>}

              <div className="payment-status-actions">
                {(registration.paymentStatus === 'FAILED' ||
                  registration.paymentStatus === 'CANCELLED') && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRetry}
                    disabled={retrying}
                  >
                    {retrying ? 'Redirecting...' : 'Try Payment Again'}
                  </button>
                )}
                <Link
                  to={`/events/${registration.eventId}`}
                  className="btn btn-outline"
                >
                  View Event
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
