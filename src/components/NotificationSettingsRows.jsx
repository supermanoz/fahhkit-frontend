import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../api/push'
import { IconBell, IconFlag, IconMegaphone } from './GameIcons'

// Rows for the in-game Settings tab, same switch look as Music/Sound. Loads
// from and saves to GET/PUT /v1/notification-setting; a failed save reverts
// the switch and shows a quiet line under that row.
// TODO: add a "Reminders" row here once the backend exposes a reminders
// preference (today reminders are the local on-device ones, see Reminders
// above this block in GamePage's Settings).
const ROWS = [
  {
    key: 'broadcastsEnabled',
    label: 'Broadcasts',
    on: 'News and announcements',
    off: 'Broadcast alerts off',
    Icon: IconMegaphone,
  },
  {
    key: 'clubWarEnabled',
    label: 'Club War',
    on: 'Matched, started and ending soon',
    off: 'Club war alerts off',
    Icon: IconFlag,
  },
  {
    key: 'territoryEnabled',
    label: 'Territory alerts',
    on: 'When someone takes your turf',
    off: 'Territory alerts off',
    Icon: IconBell,
  },
]

/* eslint-disable react/prop-types -- no prop-types dependency in this project */
export default function NotificationSettingsRows({ push }) {
  const [settings, setSettings] = useState(null)
  const [failedKey, setFailedKey] = useState(null)
  const savingRef = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    getNotificationSettings()
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch(() => {
        if (!cancelled) {
          // Quietly fall back to "everything on" (the backend default).
          setSettings({
            broadcastsEnabled: true,
            clubWarEnabled: true,
            territoryEnabled: true,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The player may have changed the OS permission while the app was in the
  // background.
  const { refreshPermission } = push
  useEffect(() => {
    refreshPermission()
  }, [refreshPermission])

  const toggle = useCallback(
    async (key) => {
      if (!settings || savingRef.current.has(key)) return
      const next = !(settings[key] !== false)
      setFailedKey(null)
      setSettings((s) => ({ ...s, [key]: next }))
      savingRef.current.add(key)
      try {
        await updateNotificationSettings({ [key]: next })
        // Turning something on is the natural moment to make sure the OS
        // would actually deliver it.
        if (next && push.supported && push.permission !== 'granted') {
          push.requestPermission()
        }
      } catch {
        setSettings((s) => ({ ...s, [key]: !next }))
        setFailedKey(key)
      } finally {
        savingRef.current.delete(key)
      }
    },
    [settings, push]
  )

  return (
    <>
      {ROWS.map(({ key, label, on, off, Icon }) => {
        const enabled = settings ? settings[key] !== false : true
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!settings}
            className="game-settings-row"
            data-testid={`notif-${key}`}
            onClick={() => toggle(key)}
          >
            <span className="game-settings-row-label">
              <span className="game-settings-row-icon">
                <span
                  className="game-settings-row-icon-badge"
                  aria-hidden="true"
                >
                  <Icon />
                </span>
              </span>
              <span className="game-settings-row-text">
                {label}
                <span className="game-settings-row-sub">
                  {failedKey === key
                    ? "Couldn't save - try again"
                    : enabled
                      ? on
                      : off}
                </span>
              </span>
            </span>
            <span
              className={`game-switch ${enabled ? 'is-on' : ''}`}
              aria-hidden="true"
            >
              <span className="game-switch-knob" />
            </span>
          </button>
        )
      })}
      {push.supported && push.permission === 'denied' && (
        <button
          type="button"
          className="game-settings-row"
          data-testid="notif-permission-hint"
          onClick={push.openSystemSettings}
        >
          <span className="game-settings-row-label">
            <span className="game-settings-row-text">
              Notifications are blocked
              <span className="game-settings-row-sub">
                Turn them on in your phone&apos;s settings to get alerts - tap
                to open
              </span>
            </span>
          </span>
        </button>
      )}
    </>
  )
}
