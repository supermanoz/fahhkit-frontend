/* eslint-disable react/prop-types -- test harness */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import VolumeSlider from './VolumeSlider'

// jsdom has no layout: the rail is 200px wide starting at x=100.
function mockRail(container) {
  const rail = container.querySelector('.vs-rail')
  rail.getBoundingClientRect = () => ({
    left: 100,
    right: 300,
    width: 200,
    top: 0,
    bottom: 44,
    height: 44,
  })
}

function Harness({ initial = 35, onCommit, onToggleMute, step }) {
  const [v, setV] = useState(initial)
  return (
    <VolumeSlider
      label="Music"
      value={v}
      onChange={setV}
      onCommit={onCommit}
      onToggleMute={onToggleMute}
      step={step}
    />
  )
}

// jsdom has no PointerEvent (fireEvent would drop clientX): a MouseEvent with
// the pointer fields is enough for the component's handlers.
if (!window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
}

afterEach(cleanup)

const slider = () => screen.getByRole('slider', { name: 'Music' })

describe('VolumeSlider', () => {
  it('exposes a real slider: role, range, value and text', () => {
    render(<Harness initial={35} />)
    const s = slider()
    expect(s).toHaveAttribute('aria-valuemin', '0')
    expect(s).toHaveAttribute('aria-valuemax', '100')
    expect(s).toHaveAttribute('aria-valuenow', '35')
    expect(s).toHaveAttribute('aria-valuetext', '35 percent')
    expect(s).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('35%')).toBeInTheDocument()
  })

  it('tap on the track jumps there', () => {
    const { container } = render(<Harness initial={10} />)
    mockRail(container)
    fireEvent.pointerDown(slider(), { clientX: 200, pointerId: 1 })
    expect(slider()).toHaveAttribute('aria-valuenow', '50')
    fireEvent.pointerUp(slider(), { clientX: 200, pointerId: 1 })
  })

  it('drag updates live, shows the % bubble, and commits once on release', () => {
    const onCommit = vi.fn()
    const { container } = render(<Harness initial={0} onCommit={onCommit} />)
    mockRail(container)
    const s = slider()
    fireEvent.pointerDown(s, { clientX: 100, pointerId: 1 })
    expect(container.querySelector('.vs-bubble')).toBeInTheDocument()
    fireEvent.pointerMove(s, { clientX: 150, pointerId: 1 })
    expect(s).toHaveAttribute('aria-valuenow', '25')
    fireEvent.pointerMove(s, { clientX: 260, pointerId: 1 })
    expect(s).toHaveAttribute('aria-valuenow', '80')
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(s, { clientX: 260, pointerId: 1 })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(80)
    expect(container.querySelector('.vs-bubble')).toBeNull()
    // Moving after release does nothing.
    fireEvent.pointerMove(s, { clientX: 120, pointerId: 1 })
    expect(s).toHaveAttribute('aria-valuenow', '80')
  })

  it('clamps outside the track (0..100)', () => {
    const { container } = render(<Harness initial={50} />)
    mockRail(container)
    const s = slider()
    fireEvent.pointerDown(s, { clientX: 20, pointerId: 1 })
    expect(s).toHaveAttribute('aria-valuenow', '0')
    fireEvent.pointerMove(s, { clientX: 900, pointerId: 1 })
    expect(s).toHaveAttribute('aria-valuenow', '100')
    fireEvent.pointerUp(s, { pointerId: 1 })
  })

  it('a cancelled drag (the browser took the gesture) does not commit', () => {
    const onCommit = vi.fn()
    const { container } = render(<Harness initial={0} onCommit={onCommit} />)
    mockRail(container)
    fireEvent.pointerDown(slider(), { clientX: 150, pointerId: 1 })
    fireEvent.pointerCancel(slider(), { pointerId: 1 })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('keyboard: arrows, PageUp/Down, Home/End, commit on key up', () => {
    const onCommit = vi.fn()
    render(<Harness initial={50} onCommit={onCommit} />)
    const s = slider()
    fireEvent.keyDown(s, { key: 'ArrowRight' })
    expect(s).toHaveAttribute('aria-valuenow', '51')
    fireEvent.keyDown(s, { key: 'ArrowLeft' })
    fireEvent.keyDown(s, { key: 'ArrowLeft' })
    expect(s).toHaveAttribute('aria-valuenow', '49')
    fireEvent.keyDown(s, { key: 'PageUp' })
    expect(s).toHaveAttribute('aria-valuenow', '59')
    fireEvent.keyDown(s, { key: 'PageDown' })
    fireEvent.keyDown(s, { key: 'PageDown' })
    expect(s).toHaveAttribute('aria-valuenow', '39')
    fireEvent.keyDown(s, { key: 'End' })
    expect(s).toHaveAttribute('aria-valuenow', '100')
    fireEvent.keyDown(s, { key: 'ArrowUp' }) // stays at 100
    expect(s).toHaveAttribute('aria-valuenow', '100')
    fireEvent.keyDown(s, { key: 'Home' })
    expect(s).toHaveAttribute('aria-valuenow', '0')
    fireEvent.keyUp(s, { key: 'Home' })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(0)
  })

  it('other keys are ignored (Tab keeps working)', () => {
    render(<Harness initial={50} />)
    const notPrevented = fireEvent.keyDown(slider(), { key: 'Tab' })
    expect(notPrevented).toBe(true)
    expect(slider()).toHaveAttribute('aria-valuenow', '50')
  })

  it('speaker: glyph follows the level and the label says what a tap does', () => {
    const toggle = vi.fn()
    const { rerender } = render(
      <VolumeSlider
        label="Music"
        value={0}
        onChange={() => {}}
        onToggleMute={toggle}
      />
    )
    const btn = screen.getByRole('button', { name: 'Unmute Music' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(toggle).toHaveBeenCalledTimes(1)

    const level = () => document.querySelector('.vs').getAttribute('data-level')
    expect(level()).toBe('muted')
    rerender(
      <VolumeSlider
        label="Music"
        value={30}
        onChange={() => {}}
        onToggleMute={toggle}
      />
    )
    expect(level()).toBe('low')
    expect(screen.getByRole('button', { name: 'Mute Music' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    rerender(
      <VolumeSlider
        label="Music"
        value={80}
        onChange={() => {}}
        onToggleMute={toggle}
      />
    )
    expect(level()).toBe('high')
  })

  it('opts out of the global click sound (no double tick)', () => {
    render(<Harness />)
    expect(slider()).toHaveAttribute('data-no-sound')
  })
})
