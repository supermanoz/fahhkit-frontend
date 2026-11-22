/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useRef, useState } from 'react'
import {
  IconVolumeLow,
  IconVolumeMute,
  IconVolumeUp,
} from '../../components/GameIcons'
import { clampVolume, volumeLevel } from '../../utils/audioSettings'
import './VolumeSlider.css'

// Chunky game-style 0-100 slider: dark rounded track, purple fill, big round
// thumb with a % bubble while dragging, a speaker button on the left that
// mutes / restores the previous level (its glyph follows the level) and the
// number on the right.
//
// Controlled: `value` + `onChange(next)` fire live while dragging (apply the
// volume there); `onCommit(next)` fires once on release / after a key press
// (play the sample tick there); `onToggleMute()` is the speaker.
// Pointer: setPointerCapture drag, tap on the track jumps there, and
// touch-action: pan-y lets vertical swipes still scroll the page while a
// horizontal drag belongs to the slider. Keyboard: role="slider" with arrows,
// PageUp/PageDown (+-10), Home/End.
const ICONS = { muted: IconVolumeMute, low: IconVolumeLow, high: IconVolumeUp }

export default function VolumeSlider({
  label,
  value,
  onChange,
  onCommit,
  onToggleMute,
  step = 1,
  testId,
}) {
  const railRef = useRef(null)
  const dragging = useRef(false)
  const latest = useRef(value)
  const keyDirty = useRef(false)
  const [dragUi, setDragUi] = useState(false)
  latest.current = value

  const level = volumeLevel(value)
  const Icon = ICONS[level]

  function emit(next) {
    const v = clampVolume(next)
    if (v === latest.current) return v
    latest.current = v
    onChange?.(v)
    return v
  }

  function fromPointer(e) {
    const rect = railRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return latest.current
    const ratio = (e.clientX - rect.left) / rect.width
    const raw = Math.min(1, Math.max(0, ratio)) * 100
    return Math.round(raw / step) * step
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragging.current = true
    setDragUi(true)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Capture is best-effort.
    }
    emit(fromPointer(e))
  }

  function onPointerMove(e) {
    if (dragging.current) emit(fromPointer(e))
  }

  function endDrag(e, commit) {
    if (!dragging.current) return
    dragging.current = false
    setDragUi(false)
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // Already released.
    }
    if (commit) onCommit?.(latest.current)
  }

  function onKeyDown(e) {
    const big = 10
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
      next = latest.current + step
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
      next = latest.current - step
    else if (e.key === 'PageUp') next = latest.current + big
    else if (e.key === 'PageDown') next = latest.current - big
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = 100
    if (next == null) return
    e.preventDefault()
    keyDirty.current = true
    emit(next)
  }

  function onKeyUp() {
    if (!keyDirty.current) return
    keyDirty.current = false
    onCommit?.(latest.current)
  }

  const muted = level === 'muted'
  return (
    <div className="vs" data-testid={testId} data-level={level}>
      <button
        type="button"
        className="vs-speaker"
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        aria-pressed={muted}
        onClick={onToggleMute}
      >
        <Icon />
      </button>
      <div
        className={`vs-slider${dragUi ? ' is-dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} percent`}
        data-no-sound
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onLostPointerCapture={(e) => endDrag(e, true)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <div className="vs-rail" ref={railRef}>
          <div className="vs-track">
            <div className="vs-fill" style={{ width: `${value}%` }} />
          </div>
          <div className="vs-thumb" style={{ left: `${value}%` }}>
            {dragUi && (
              <span className="vs-bubble" aria-hidden="true">
                {value}%
              </span>
            )}
          </div>
        </div>
      </div>
      <span className="vs-value" aria-hidden="true">
        {value}%
      </span>
    </div>
  )
}
