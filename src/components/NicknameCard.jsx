/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { ApiError } from '../api/client'
import { NICKNAME_PATTERN, setNickname } from '../api/user'

// Me tab prompt for players with no nickname yet: pick a runner tag, which
// then shows everywhere in the game instead of the first name. Hidden once
// a nickname is set (the backend keeps it; changing it later lives in the
// site's Edit Profile page).
export default function NicknameCard({ onSaved }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const trimmed = value.trim()
  const valid = NICKNAME_PATTERN.test(trimmed)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      const updated = await setNickname(trimmed)
      onSaved?.(updated)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not save that nickname - try again.'
      )
      setSaving(false)
    }
  }

  return (
    <form className="nickname-card" onSubmit={handleSubmit}>
      <p className="nickname-card-title">Pick your runner tag</p>
      <p className="nickname-card-sub">
        It&apos;s what rivals see on the map, the leaderboard and in races.
      </p>
      <div className="nickname-card-row">
        <span className="nickname-card-at" aria-hidden="true">
          @
        </span>
        <input
          type="text"
          className="game-club-input nickname-card-input"
          placeholder="e.g. blaze_runner"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          maxLength={20}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Nickname"
          aria-invalid={trimmed !== '' && !valid}
        />
        <button
          type="submit"
          className="game-btn game-btn-green game-btn-sm"
          disabled={!valid || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p
        className={`nickname-card-hint ${trimmed !== '' && !valid ? 'is-error' : ''}`}
      >
        3-20 letters, numbers or _ · no spaces
      </p>
      {error && (
        <p className="game-controls-hint game-controls-hint-error">{error}</p>
      )}
    </form>
  )
}
