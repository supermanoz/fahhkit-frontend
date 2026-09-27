import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaChevronDown, FaUserCircle } from 'react-icons/fa'
import {
  canManageEvents,
  clearToken,
  clearUser,
  isAdmin,
  resolveFileUrl,
} from '../api/client'
import { useCurrentUser } from '../hooks/useCurrentUser'
import ThemeToggle from './ThemeToggle'
import './Navbar.css'
import { playerNameOf } from '../utils/playerName'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { user, isAuthed } = useCurrentUser()
  const navigate = useNavigate()
  const userMenuRef = useRef(null)

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

  function close() {
    setOpen(false)
    setUserMenuOpen(false)
  }

  function handleSignOut() {
    clearToken()
    clearUser()
    close()
    navigate('/')
  }

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
          {isAdmin(user) && (
            <Link to="/admin/dashboard" onClick={close}>
              Dashboard
            </Link>
          )}
          <Link to="/events" onClick={close}>
            Events
          </Link>
          {canManageEvents(user) && (
            <Link to="/athletes" onClick={close}>
              Athletes
            </Link>
          )}
          {isAdmin(user) && (
            <Link to="/admin/moderators" onClick={close}>
              Moderators
            </Link>
          )}
          <Link to="/contact" onClick={close}>
            Contact
          </Link>
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
              <Link to="/register" className="btn btn-primary" onClick={close}>
                Sign Up
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
