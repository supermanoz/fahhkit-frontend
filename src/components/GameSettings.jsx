/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useRef, useState, useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { GameActions, GameModal } from '../game/ui/GameModal'
import { useToast } from '../game/ui/Toast'
import VolumeSlider from '../game/ui/VolumeSlider'
import { TOUR_ACTIONS } from '../constants/tourCopy'
import { GAME_CONTACT_EMAIL } from '../constants/gameLegal'
import { isNative } from '../utils/geo'
import { toggleMapDebug } from '../utils/mapDebug'
import { copyText, openExternal, openMailto } from '../utils/externalLink'
import { playSfx } from '../utils/gameSound'
import {
  IconBook,
  IconChevronRight,
  IconCompassNeedle,
  IconCopy,
  IconCrosshairs,
  IconEnvelope,
  IconInfo,
  IconInstagram,
  IconLock,
  IconLogout,
  IconUser,
} from './GameIcons'
import MapStylePicker from './MapStylePicker'
import NotificationsSection from './NotificationsSection'
import { mapConfig } from '../config/mapProvider'
import {
  setRotateWhileRunning,
  useRotateWhileRunning,
} from '../utils/mapRotationSetting'
import { RowLabel, SettingsCard, SwitchRow } from './SettingsParts'
import './GameSettings.css'
import GameButton from './ui/GameButton'

const INSTAGRAM_URL = 'https://www.instagram.com/runconquest.game/'
const INSTAGRAM_HANDLE = '@runconquest.game'
const TICK_GAP_MS = 140

// A row that opens something (chevron on the right).
function NavRow({ Icon, title, sub, onClick, testId }) {
  return (
    <button
      type="button"
      className="game-settings-row"
      data-testid={testId}
      onClick={onClick}
    >
      <RowLabel Icon={Icon} title={title} sub={sub} />
      <IconChevronRight
        className="game-settings-row-chevron"
        aria-hidden="true"
      />
    </button>
  )
}

function SliderRow({ title, sub, children }) {
  return (
    <div className="set-slider-row">
      <div className="game-settings-row-text">
        {title}
        <span className="game-settings-row-sub">{sub}</span>
      </div>
      {children}
    </div>
  )
}

// The whole Settings tab. Every setting, storage key, API call and behaviour
// is the one that already existed - this only lays them out in grouped cards.
// The pieces that own behaviour stay where they were and arrive as props:
// audio (hooks/useAudioVolumes), push, map style, PvP visibility, and the
// handlers for edit-profile / how-to-play / legal pages / log out.
// Secret switch on the version text: hold ~1.5 s OR tap it 7 times quickly.
// Mobile browsers start text selection / a context menu on a long press and
// cancel the pointer events, so: no selection (user-select none), the context
// menu is swallowed (and counts as the hold finishing), pointercancel does not
// abort it, and the tap count is a second way in. Module-level state, because
// the props below are rebuilt on every render.
const secret = { timer: null, taps: 0, lastTap: 0, fired: false }
function secretSwitchProps(fn, ms = 1500) {
  const fire = () => {
    if (secret.fired) return
    secret.fired = true
    clearTimeout(secret.timer)
    fn()
  }
  return {
    style: {
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      touchAction: 'manipulation',
    },
    onPointerDown: () => {
      secret.fired = false
      clearTimeout(secret.timer)
      secret.timer = setTimeout(fire, ms)
    },
    onPointerUp: () => {
      clearTimeout(secret.timer)
      const now = Date.now()
      secret.taps = now - secret.lastTap < 800 ? secret.taps + 1 : 1
      secret.lastTap = now
      if (secret.taps >= 7) {
        secret.taps = 0
        secret.fired = false
        fire()
      }
    },
    onPointerLeave: () => clearTimeout(secret.timer),
    onContextMenu: (e) => {
      e.preventDefault()
      fire()
    },
  }
}

export default function GameSettings({
  audio,
  push,
  mapStyles,
  mapStyleId,
  onSelectMapStyle,
  pvp,
  onEditProfile,
  onHowToPlay,
  onOpenLegal,
  onLogout,
}) {
  const toast = useToast()
  const rotateMap = useRotateWhileRunning()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [version, setVersion] = useState(null)
  const lastTick = useRef(0)

  useEffect(() => {
    if (!isNative) return undefined
    let cancelled = false
    CapacitorApp.getInfo()
      .then((info) => {
        if (!cancelled) setVersion(`${info.version} (${info.build})`)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // The Sound slider plays one short tick on release so the player hears the
  // level they picked (throttled; playSfx itself is silent at 0).
  function previewSfx() {
    const now = performance.now()
    if (now - lastTick.current < TICK_GAP_MS) return
    lastTick.current = now
    playSfx('tick')
  }

  async function copyEmail() {
    const ok = await copyText(GAME_CONTACT_EMAIL)
    toast.push(ok ? 'Copied' : "Couldn't copy - long-press the address", {
      type: ok ? 'success' : 'error',
      duration: 2000,
    })
  }

  function toggleVisibility() {
    const next = !pvp.discoverable
    // Turning Visibility on = open to challenges, so ask (once) to notify
    // them while the app is in the background.
    if (
      next &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {})
    }
    pvp.toggleDiscoverable(next)
  }

  return (
    <div className="game-menu-panel game-menu-settings game-cards set-page">
      <SettingsCard id="sound" title="Sound">
        <SliderRow
          title="Music"
          sub={audio.musicMuted ? 'Muted' : 'Background music'}
        >
          <VolumeSlider
            label="Music"
            testId="slider-music"
            value={audio.musicVolume}
            onChange={audio.changeMusic}
            onToggleMute={audio.toggleMusicMute}
          />
        </SliderRow>
        <SliderRow
          title="Sound effects"
          sub={audio.sfxMuted ? 'Muted' : 'Taps, popups and alerts'}
        >
          <VolumeSlider
            label="Sound effects"
            testId="slider-sfx"
            value={audio.sfxVolume}
            onChange={audio.changeSfx}
            onCommit={previewSfx}
            onToggleMute={audio.toggleSfxMute}
          />
        </SliderRow>
      </SettingsCard>

      <SettingsCard id="notifications" title="Notifications">
        {/* Every notification control (permission, game alerts) lives in
            this one collapsible section. */}
        <NotificationsSection push={push} />
      </SettingsCard>

      <SettingsCard id="map" title="Map">
        <MapStylePicker
          styles={mapStyles}
          selectedId={mapStyleId}
          onSelect={onSelectMapStyle}
        />
        <SwitchRow
          Icon={IconCompassNeedle}
          title="Rotate map while running"
          sub={
            rotateMap
              ? 'The map turns to face the way you run'
              : 'The map always keeps north up'
          }
          checked={rotateMap}
          onToggle={() => setRotateWhileRunning(!rotateMap)}
          testId="rotate-map-switch"
        />
      </SettingsCard>

      <SettingsCard id="privacy" title="Privacy">
        <SwitchRow
          Icon={IconCrosshairs}
          title="Visibility"
          sub={
            pvp.discoverable
              ? 'Nearby runners can find and challenge you'
              : 'Hidden from nearby runners'
          }
          checked={pvp.discoverable}
          disabled={pvp.busy === 'discoverable'}
          onToggle={toggleVisibility}
          testId="visibility-switch"
        />
        {pvp.error && (
          <p className="game-controls-hint game-controls-hint-error set-error">
            {pvp.error}
          </p>
        )}
      </SettingsCard>

      <SettingsCard id="account" title="Account">
        <NavRow
          Icon={IconUser}
          title="Edit profile"
          sub="Opens your FahhKit account"
          onClick={onEditProfile}
        />
        <div className="set-logout-wrap">
          <button
            type="button"
            className="set-logout-btn"
            data-testid="logout-btn"
            onClick={() => setConfirmLogout(true)}
          >
            <IconLogout aria-hidden="true" />
            Log out
          </button>
        </div>
      </SettingsCard>

      <SettingsCard id="help" title="Help">
        <NavRow
          Icon={IconBook}
          title={TOUR_ACTIONS.howToPlay}
          sub={TOUR_ACTIONS.howToPlaySub}
          onClick={onHowToPlay}
          testId="how-to-play"
        />
        {/* Contact us: Instagram + the support email (with a copy button). */}
        <div className="game-settings-contact">
          <a
            className="game-settings-row"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternal(INSTAGRAM_URL, e, { app: true })}
          >
            <RowLabel
              Icon={IconInstagram}
              title="Contact us on Instagram"
              sub={INSTAGRAM_HANDLE}
            />
            <IconChevronRight
              className="game-settings-row-chevron"
              aria-hidden="true"
            />
          </a>
          <div className="game-settings-row set-email-row">
            <RowLabel
              Icon={IconEnvelope}
              title="Email us"
              sub={
                <a
                  className="set-email-link"
                  href={`mailto:${GAME_CONTACT_EMAIL}`}
                  onClick={(e) => openMailto(GAME_CONTACT_EMAIL, e)}
                >
                  {GAME_CONTACT_EMAIL.split('@')[0]}
                  <wbr />@{GAME_CONTACT_EMAIL.split('@')[1]}
                </a>
              }
            />
            <button
              type="button"
              className="game-settings-contact-copy"
              aria-label="Copy email address"
              onClick={copyEmail}
            >
              <IconCopy />
            </button>
          </div>
        </div>
        <NavRow
          Icon={IconLock}
          title="Terms & Conditions"
          sub="The rules of Run Conquest"
          onClick={() => onOpenLegal('terms')}
        />
        <NavRow
          Icon={IconLock}
          title="Privacy Policy"
          sub="What we collect and why"
          onClick={() => onOpenLegal('privacy')}
        />
      </SettingsCard>

      <SettingsCard id="about" title="About">
        <div className="game-settings-row set-static-row">
          <RowLabel Icon={IconInfo} title="Version" />
          <span
            className="set-static-value"
            data-testid="app-version"
            {...secretSwitchProps(() => {
              const on = toggleMapDebug()
              toast.push(on ? 'Map debug panel ON' : 'Map debug panel off')
            })}
          >
            {version || 'Web'}
          </span>
        </div>
        {/* No dedicated About page exists in this app - this is the closest
            real equivalent to the "Settings/About page" the map tile credits
            need to show up on. */}
        <p className="game-settings-credits">{mapConfig.creditText}</p>
      </SettingsCard>

      <GameModal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        tone="danger"
        title="Log out?"
      >
        <p className="set-confirm-text">
          You&apos;ll return to the sign-in screen.
        </p>
        <GameActions>
          <GameButton variant="neutral" onClick={() => setConfirmLogout(false)}>
            Stay
          </GameButton>
          <GameButton
            variant="danger"
            data-testid="logout-confirm"
            onClick={() => {
              setConfirmLogout(false)
              onLogout()
            }}
          >
            Log out
          </GameButton>
        </GameActions>
      </GameModal>
    </div>
  )
}
