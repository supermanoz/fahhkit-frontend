/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../api/push'
import { useToast } from '../game/ui/Toast'
import { useNotificationPermission } from '../hooks/useNotificationPermission'
import { REMINDER_SLOTS } from '../config/reminders'
import { scheduleTestReminderInOneMinute } from '../utils/reminders'
import {
  IconBell,
  IconChevronDown,
  IconClock,
  IconFlag,
  IconMegaphone,
} from './GameIcons'
import './NotificationsSection.css'

// Every notification control in Settings lives here (Music/Sound stay out -
// they're audio). Same collapsible pattern as MapStylePicker: a settings row
// header with a chevron, the body animating open underneath.
//
// - Permission: the OS (native) / browser (web) state + the button to fix it.
// - Game alerts: server prefs, GET/PUT /v1/notification-setting.
// - Run reminders: the local daily notifications (master + per-slot).
// A switch is greyed with "Allow notifications first" while the permission is
// denied; while it is merely not asked yet, flipping one on shows the prompt
// first and only applies if it is granted.
const ALERT_ROWS = [
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

const PERMISSION_LABEL = {
  granted: 'Allowed',
  denied: 'Not allowed',
  prompt: 'Not asked yet',
}

function formatSlotTime({ hour, minute }) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function SwitchRow({
  testId,
  Icon,
  label,
  sub,
  checked,
  disabled = false,
  nested = false,
  onToggle,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`game-settings-row notif-row${nested ? ' is-nested' : ''}${
        disabled ? ' is-blocked' : ''
      }`}
      data-testid={testId}
      onClick={onToggle}
    >
      <span className="game-settings-row-label">
        <span className="game-settings-row-icon">
          <span className="game-settings-row-icon-badge" aria-hidden="true">
            <Icon />
          </span>
        </span>
        <span className="game-settings-row-text">
          {label}
          <span className="game-settings-row-sub">{sub}</span>
        </span>
      </span>
      <span
        className={`game-switch ${checked ? 'is-on' : ''}`}
        aria-hidden="true"
      >
        <span className="game-switch-knob" />
      </span>
    </button>
  )
}

export default function NotificationsSection({
  push,
  reminders,
  showReminders,
  showReminderDebug,
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const permission = useNotificationPermission(push)
  const [settings, setSettings] = useState(null)
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

  const blocked = permission.state === 'denied'
  const hint = 'Allow notifications first'

  // True when it's fine to turn something on: already allowed, or the
  // prompt was just shown and accepted.
  const ensureAllowed = useCallback(async () => {
    if (permission.state === 'granted') return true
    if (permission.state === 'denied') return false
    return (await permission.request()) === 'granted'
  }, [permission])

  const toggleAlert = useCallback(
    async (key) => {
      if (!settings || savingRef.current.has(key)) return
      const next = !(settings[key] !== false)
      if (next && !(await ensureAllowed())) return
      setSettings((s) => ({ ...s, [key]: next }))
      savingRef.current.add(key)
      try {
        await updateNotificationSettings({ [key]: next })
      } catch {
        setSettings((s) => ({ ...s, [key]: !next }))
        toast.push("Couldn't save that - try again", {
          type: 'error',
          duration: 2500,
        })
      } finally {
        savingRef.current.delete(key)
      }
    },
    [settings, ensureAllowed, toast]
  )

  const toggleReminders = useCallback(async () => {
    const next = !reminders.enabled
    if (next && !(await ensureAllowed())) return
    reminders.toggle(next)
  }, [reminders, ensureAllowed])

  const toggleSlot = useCallback(
    async (slotId) => {
      const next = !reminders.slots[slotId]
      if (next && !(await ensureAllowed())) return
      reminders.toggleSlot(slotId, next)
    },
    [reminders, ensureAllowed]
  )

  const summary =
    permission.state === 'unknown'
      ? 'Alerts and reminders'
      : permission.state === 'granted'
        ? 'Alerts and reminders'
        : permission.state === 'denied'
          ? 'Blocked - allow them to get alerts'
          : 'Not turned on yet'

  return (
    <div className="notif-section" data-testid="notif-section">
      <button
        type="button"
        className="game-settings-row"
        aria-expanded={open}
        aria-controls="notif-section-body"
        data-testid="notif-section-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="game-settings-row-label">
          <span className="game-settings-row-icon">
            <span className="game-settings-row-icon-badge" aria-hidden="true">
              <IconBell />
            </span>
          </span>
          <span className="game-settings-row-text">
            Notifications
            <span className="game-settings-row-sub">{summary}</span>
          </span>
        </span>
        <IconChevronDown
          className={`game-settings-row-chevron notif-section-chevron${
            open ? ' is-open' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="notif-section-body"
            className="notif-section-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
          >
            <div className="notif-card">
              {permission.supported && permission.state !== 'unknown' && (
                <div
                  className="game-settings-row notif-permission"
                  data-testid="notif-permission"
                  data-state={permission.state}
                >
                  <span className="game-settings-row-label">
                    <span className="game-settings-row-icon">
                      <span
                        className="game-settings-row-icon-badge"
                        aria-hidden="true"
                      >
                        <IconBell />
                      </span>
                    </span>
                    <span className="game-settings-row-text">
                      Permission
                      <span
                        className="game-settings-row-sub"
                        data-testid="notif-permission-state"
                      >
                        {PERMISSION_LABEL[permission.state]}
                      </span>
                    </span>
                  </span>
                  {permission.state === 'prompt' && (
                    <button
                      type="button"
                      className="notif-permission-btn"
                      data-testid="notif-allow"
                      onClick={permission.request}
                    >
                      Allow notifications
                    </button>
                  )}
                  {permission.state === 'denied' &&
                    (push.supported || showReminders ? (
                      <button
                        type="button"
                        className="notif-permission-btn"
                        data-testid="notif-open-settings"
                        onClick={push.openSystemSettings}
                      >
                        Open phone settings
                      </button>
                    ) : (
                      <span className="notif-permission-note">
                        Change it in your browser&apos;s site settings
                      </span>
                    ))}
                </div>
              )}

              <h4 className="notif-group-title">Game alerts</h4>
              {settings === null ? (
                <div
                  className="notif-skeleton"
                  data-testid="notif-skeleton"
                  aria-busy="true"
                  aria-label="Loading alert settings"
                >
                  {ALERT_ROWS.map((r) => (
                    <div key={r.key} className="notif-skeleton-row">
                      <span className="notif-skeleton-badge" />
                      <span className="notif-skeleton-lines">
                        <span />
                        <span />
                      </span>
                      <span className="notif-skeleton-switch" />
                    </div>
                  ))}
                </div>
              ) : (
                ALERT_ROWS.map(({ key, label, on, off, Icon }) => {
                  const enabled = settings[key] !== false
                  return (
                    <SwitchRow
                      key={key}
                      testId={`notif-${key}`}
                      Icon={Icon}
                      label={label}
                      sub={blocked ? hint : enabled ? on : off}
                      checked={enabled}
                      disabled={blocked}
                      onToggle={() => toggleAlert(key)}
                    />
                  )
                })
              )}

              {showReminders && (
                <>
                  <h4 className="notif-group-title">Run reminders</h4>
                  <SwitchRow
                    testId="notif-reminders"
                    Icon={IconBell}
                    label="Daily reminders"
                    sub={
                      blocked
                        ? hint
                        : reminders.enabled
                          ? 'Nudges to go run, on your schedule'
                          : 'Daily run reminders off'
                    }
                    checked={reminders.enabled}
                    disabled={blocked}
                    onToggle={toggleReminders}
                  />
                  {REMINDER_SLOTS.map((slot) => (
                    <SwitchRow
                      key={slot.id}
                      testId={`notif-slot-${slot.id}`}
                      Icon={IconClock}
                      label={slot.label}
                      sub={
                        blocked
                          ? hint
                          : !reminders.enabled
                            ? 'Turn on daily reminders first'
                            : formatSlotTime(slot)
                      }
                      checked={reminders.slots[slot.id]}
                      disabled={blocked || !reminders.enabled}
                      nested
                      onToggle={() => toggleSlot(slot.id)}
                    />
                  ))}
                  {showReminderDebug && (
                    <button
                      type="button"
                      className="game-settings-row"
                      onClick={() => scheduleTestReminderInOneMinute()}
                    >
                      <span className="game-settings-row-label">
                        <span className="game-settings-row-text">
                          Send test reminder (1 min)
                          <span className="game-settings-row-sub">
                            Debug only - ?debug=reminders
                          </span>
                        </span>
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
