import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { FaChevronDown, FaUserCircle } from 'react-icons/fa'
import {
  canManageEvents,
  clearToken,
  clearUser,
  isAdmin,
  resolveFileUrl,
} from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { getTerritoryProfile } from '../api/territory'
import { formatCoins } from '../utils/format'
import ThemeToggle from './ThemeToggle'
import CoinStack from './CoinStack'
import './Navbar.css'
import { playerNameOf } from '../utils/playerName'

function navLinkClass({ isActive }) {
  return `navbar-link${isActive ? ' is-active' : ''}`
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const { user, isAuthed } = useCurrentUser()
  const navigate = useNavigate()
  const userMenuRef = useRef(null)
  const adminMenuRef = useRef(null)

  // Fahhcoin balance for the pill next to the profile menu - same
  // /v1/territory/profile the game's own HUD reads, so it's never a second
  // source of truth.
  const [balance, setBalance] = useState(null)
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
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAuthed])

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!userMenuOpen) return
    function onClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [userMenuOpen])

  useEffect(() => {
    if (!adminMenuOpen) return
    function onClickOutside(e) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) {
        setAdminMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [adminMenuOpen])

  function close() {
    setOpen(false)
    setUserMenuOpen(false)
    setAdminMenuOpen(false)
  }

  function handleSignOut() {
    clearToken()
    clearUser()
    close()
    navigate('/')
  }

  // Everything gated by isAdmin or canManageEvents keeps the exact same
  // permission it already had - this only moves Moderators/Game Mechanics/
  // Fraud Flags off the main row into their own "Admin" group so the main
  // row doesn't wrap. The trigger itself only shows for someone who can
  // reach at least one of the three.
  const hasAdminAccess = isAdmin(user) || canManageEvents(user)

  return (
    <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand" onClick={close}>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="FahhKit"
            className="navbar-logo"
          />
          <span className="navbar-brand-text">Fahh Kit</span>
        </Link>

        <div className="navbar-actions">
          <button
            className={`navbar-toggle ${open ? 'open' : ''}`}
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <nav className={`navbar-links ${open ? 'open' : ''}`}>
          <div className="navbar-links-main">
            {isAdmin(user) && (
              <NavLink
                to="/admin/dashboard"
                className={navLinkClass}
                onClick={close}
              >
                Dashboard
              </NavLink>
            )}
            <NavLink to="/events" className={navLinkClass} onClick={close}>
              Events
            </NavLink>
            <NavLink to="/shop" className={navLinkClass} onClick={close}>
              Shop
            </NavLink>
            {canManageEvents(user) && (
              <NavLink to="/athletes" className={navLinkClass} onClick={close}>
                Athletes
              </NavLink>
            )}
            <NavLink to="/contact" className={navLinkClass} onClick={close}>
              Contact
            </NavLink>

            {hasAdminAccess && (
              <div className="navbar-admin-menu" ref={adminMenuRef}>
                <button
                  type="button"
                  className={`navbar-link navbar-admin-trigger ${adminMenuOpen ? 'is-open' : ''}`}
                  onClick={() => setAdminMenuOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={adminMenuOpen}
                >
                  Admin
                  <FaChevronDown className="navbar-admin-caret" />
                </button>
                {adminMenuOpen && (
                  <div className="navbar-admin-dropdown">
                    {isAdmin(user) && (
                      <Link to="/admin/moderators" onClick={close}>
                        Moderators
                      </Link>
                    )}
                    {isAdmin(user) && (
                      <Link to="/admin/game-mechanics" onClick={close}>
                        Game Mechanics
                      </Link>
                    )}
                    {canManageEvents(user) && (
                      <Link to="/admin/fraud-flags" onClick={close}>
                        Fraud Flags
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="navbar-links-side">
            {isAuthed && balance != null && (
              <span className="navbar-balance-pill">
                <CoinStack tier={0} size={18} />
                {formatCoins(balance)}
              </span>
            )}

            {isAuthed ? (
              <div className="navbar-user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className="navbar-user-trigger"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                >
                  {user?.profilePictureUrl ? (
                    <img
                      src={resolveFileUrl(user.profilePictureUrl)}
                      alt=""
                      className="navbar-user-photo"
                    />
                  ) : (
                    <FaUserCircle className="navbar-user-icon" />
                  )}
                  {playerNameOf(user)}
                  <FaChevronDown className="navbar-user-caret" />
                </button>
                {userMenuOpen && (
                  <div className="navbar-user-dropdown">
                    {/* TEMP — My Runs/Track a Run nav links removed for now; routes and
                        LiveEventRunPrompt are untouched, restore when ready to relaunch */}
                    {user?.userType === 'ATHLETE' && (
                      <Link to="/history" onClick={close}>
                        History
                      </Link>
                    )}
                    <Link to="/profile/edit" onClick={close}>
                      Edit Profile
                    </Link>
                    <button type="button" onClick={handleSignOut}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="btn btn-outline" onClick={close}>
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="btn btn-primary"
                  onClick={close}
                >
                  Sign Up
                </Link>
              </>
            )}
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  )
}
