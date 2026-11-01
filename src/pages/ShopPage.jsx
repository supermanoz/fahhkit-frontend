import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ApiError } from '../api/client'
import { getFahhcoinBundles, initiateCoinPurchase } from '../api/coinPurchase'
import { getTerritoryProfile } from '../api/territory'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { withBundleExtras } from '../utils/coinBundles'
import { formatCoins } from '../utils/format'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import CoinStack from '../components/CoinStack'
import './ShopPage.css'

const SKELETON_COUNT = 6

// Public "buy Fahhcoin" storefront, outside /game - same bundles, same
// /v1/coin-purchase API the in-game shop uses (see GamePage's
// handleBuyCoins), so prices/bonuses can never drift between the two. The
// actual charge still happens off-site at Khalti; buying here redirects
// there exactly like the in-game flow, and Khalti's own redirect back to
// /payment-status is what resolves success/failure (see PaymentStatusPage) -
// there's no separate purchase flow to keep in sync.
export default function ShopPage() {
  const { isAuthed } = useCurrentUser()
  const navigate = useNavigate()

  const [bundles, setBundles] = useState(null)
  const [bundlesError, setBundlesError] = useState(null)
  const [balance, setBalance] = useState(null)

  const [selectedBundle, setSelectedBundle] = useState(null)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState(null)

  useEffect(() => {
    loadBundles()
  }, [])

  useEffect(() => {
    if (!isAuthed) {
      setBalance(null)
      return
    }
    let cancelled = false
    getTerritoryProfile()
      .then((profile) => {
        if (!cancelled) setBalance(profile?.fahhcoinBalance ?? 0)
      })
      .catch(() => {
        // Balance pill just stays hidden - not worth an error banner for a
        // secondary bit of chrome on what's otherwise a browsable catalog.
      })
    return () => {
      cancelled = true
    }
  }, [isAuthed])

  function loadBundles() {
    setBundlesError(null)
    getFahhcoinBundles()
      .then((data) => setBundles(data || []))
      .catch((err) =>
        setBundlesError(
          err instanceof ApiError
            ? err.message
            : 'Could not load Fahhcoin packages.'
        )
      )
  }

  function handlePick(bundle) {
    if (!isAuthed) {
      navigate('/login', { state: { from: '/shop' } })
      return
    }
    setBuyError(null)
    setSelectedBundle(bundle)
  }

  async function handleConfirm() {
    if (!selectedBundle) return
    setBuying(true)
    setBuyError(null)
    try {
      const payment = await initiateCoinPurchase(selectedBundle.fahhcoinAmount)
      window.location.href = payment.paymentUrl
    } catch (err) {
      setBuyError(
        err instanceof ApiError ? err.message : 'Could not start payment.'
      )
      setBuying(false)
    }
  }

  const extras = bundles ? withBundleExtras(bundles) : null

  return (
    <div className="shop-page">
      <Navbar />

      <div className="shop-wrap">
        <div className="shop-header">
          <div>
            <h1>Fahhcoin Shop</h1>
            <p>
              Top up your Fahhcoin balance - spend it on heroes, cosmetics and
              PvP stakes in Territory Run.
            </p>
          </div>
          {isAuthed && balance != null && (
            <span className="shop-balance-pill">
              <CoinStack tier={0} size={20} />
              {formatCoins(balance)}
              <span className="shop-balance-label">Fahhcoin</span>
            </span>
          )}
        </div>

        {bundlesError ? (
          <div className="banner error">
            {bundlesError}{' '}
            <button
              type="button"
              className="shop-retry-link"
              onClick={loadBundles}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="shop-grid game-root">
            {extras
              ? extras.map((bundle, index) => (
                  <PackCard
                    key={bundle.fahhcoinAmount}
                    bundle={bundle}
                    tier={index}
                    onSelect={() => handlePick(bundle)}
                  />
                ))
              : Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <div key={i} className="shop-pack-card is-skeleton" />
                ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedBundle && (
          <motion.div
            className="shop-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !buying && setSelectedBundle(null)}
          >
            <motion.div
              className="shop-confirm-card game-root"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              onClick={(e) => e.stopPropagation()}
            >
              <CoinStack
                tier={extras?.findIndex(
                  (b) => b.fahhcoinAmount === selectedBundle.fahhcoinAmount
                )}
                size={64}
              />
              <p className="shop-confirm-amount">
                {formatCoins(selectedBundle.fahhcoinAmount)} Fahhcoin
              </p>
              <p className="shop-confirm-price">
                Rs. {Number(selectedBundle.priceNpr).toLocaleString()}
              </p>
              {buyError && <p className="shop-confirm-error">{buyError}</p>}
              <div className="shop-confirm-actions">
                <button
                  type="button"
                  className="shop-btn-ghost"
                  onClick={() => setSelectedBundle(null)}
                  disabled={buying}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="shop-buy-btn"
                  onClick={handleConfirm}
                  disabled={buying}
                >
                  {buying ? 'Redirecting…' : 'Buy Now'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  )
}

/* eslint-disable react/prop-types -- no prop-types dependency in this project */
function PackCard({ bundle, tier, onSelect }) {
  return (
    <button type="button" className="shop-pack-card" onClick={onSelect}>
      {bundle.badge === 'BEST_VALUE' && (
        <span className="shop-pack-badge is-best">Best Value</span>
      )}
      {bundle.badge === 'POPULAR' && (
        <span className="shop-pack-badge is-popular">Most Popular</span>
      )}
      <CoinStack tier={tier} size={76} className="shop-pack-coins" />
      <span className="shop-pack-amount">
        {formatCoins(bundle.fahhcoinAmount)}
      </span>
      <span className="shop-pack-amount-label">Fahhcoin</span>
      {bundle.bonusPercent > 0 && (
        <span className="shop-pack-ribbon">+{bundle.bonusPercent}% bonus</span>
      )}
      <span className="shop-pack-buy">
        Rs. {Number(bundle.priceNpr).toLocaleString()}
      </span>
    </button>
  )
}
