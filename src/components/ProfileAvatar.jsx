/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import Avatar from '../game/ui/Avatar'
import { useImageStatus } from '../hooks/useImageStatus'
import { IconClose } from './GameIcons'
import './ProfileAvatar.css'

// The big round profile picture on a player's profile (other-player popup and
// the Me tab): thick dark outline, off-white ring, soft shadow and the
// player's level badge overlapping the bottom - a game "profile card" avatar.
//
// - loading: a round skeleton while the profile is still loading.
// - no picture / a picture that fails to load: the same-size letter avatar,
//   so the layout never changes. The letter shows until the photo has fully
//   loaded, then swaps.
// - tapping a loaded picture opens it full-size in a lightbox (closes on tap
//   or the close button); there's nothing to tap without a picture.
export default function ProfileAvatar({
  src,
  name,
  level,
  loading = false,
  fallbackColor,
}) {
  const status = useImageStatus(src || null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (loading) {
    return (
      <div className="profile-avatar-card">
        <span
          className="profile-avatar-skeleton"
          data-testid="profile-avatar-skeleton"
          aria-hidden="true"
        />
      </div>
    )
  }

  const avatar = (
    <Avatar
      src={src}
      name={name}
      size={92}
      level={level}
      fallbackColor={fallbackColor}
      className="profile-avatar"
      holdUntilLoaded
    />
  )

  return (
    <div className="profile-avatar-card" data-testid="profile-avatar">
      {status === 'loaded' ? (
        <button
          type="button"
          className="profile-avatar-btn"
          aria-label="View profile picture full size"
          onClick={() => setOpen(true)}
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}

      {open && (
        <div
          className="profile-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Profile picture"
          data-testid="profile-lightbox"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="game-close-btn profile-lightbox-close"
            aria-label="Close picture"
            onClick={() => setOpen(false)}
          >
            <IconClose />
          </button>
          <img
            className="profile-lightbox-img"
            src={src}
            alt={name || 'Profile picture'}
          />
        </div>
      )}
    </div>
  )
}
