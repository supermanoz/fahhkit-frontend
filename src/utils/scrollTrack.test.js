import { describe, expect, it, vi } from 'vitest'
import { centerCardInTrack } from './scrollTrack'

describe('centerCardInTrack', () => {
  it('scrolls only the track horizontally, never via scrollIntoView (which moves ancestors)', () => {
    const track = { clientWidth: 300, scrollTo: vi.fn() }
    const card = { offsetLeft: 600, clientWidth: 300, scrollIntoView: vi.fn() }
    centerCardInTrack(track, card)
    expect(track.scrollTo).toHaveBeenCalledWith({
      left: 600,
      behavior: 'smooth',
    })
    expect(card.scrollIntoView).not.toHaveBeenCalled()
  })
  it('never goes negative and tolerates a missing card', () => {
    const track = { clientWidth: 300, scrollTo: vi.fn() }
    centerCardInTrack(track, { offsetLeft: 0, clientWidth: 200 })
    expect(track.scrollTo.mock.calls[0][0].left).toBe(0)
    expect(() => centerCardInTrack(track, undefined)).not.toThrow()
  })
})
