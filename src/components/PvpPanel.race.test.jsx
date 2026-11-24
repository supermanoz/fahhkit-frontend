import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../api/pvp', async (orig) => ({
  ...(await orig()),
  getChallenge: vi.fn(),
}))
vi.mock('../hooks/useRivalHeroes', () => ({ useRivalHeroes: () => ({}) }))
vi.mock('./pvp/PvpParts', async (orig) => ({
  ...(await orig()),
  RivalHero: () => null,
  YouFigure: () => null,
  VsStage: () => null,
}))

import { ApiError } from '../api/client'
import { getChallenge } from '../api/pvp'
import PvpPanel from './PvpPanel'

const base = {
  id: 'r1',
  challengerId: 'me',
  challengerName: 'Me Runner',
  opponentId: 'aryan',
  opponentName: 'Aryan Karki',
  opponentNickname: 'Ary',
  distanceMeters: 1000,
  stakeAmount: 100,
  source: 'DIRECT',
  status: 'PENDING',
  challengerConfirmed: true,
  opponentConfirmed: false,
}

function panel(challenges = []) {
  const pvp = {
    challenges,
    challengesLoaded: true,
    queueEntry: null,
    nearby: null,
    discoverable: true,
    busy: null,
    error: null,
    review: vi.fn(),
    cancel: vi.fn(),
    refreshChallenges: vi.fn(),
  }
  return render(
    <PvpPanel
      pvp={pvp}
      userId="me"
      balance={500}
      focusRaceId="r1"
      onFocusHandled={() => {}}
      onStartRace={() => {}}
      onRequestStart={(go) => go()}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PvpPanel race screen', () => {
  it('declined challenge (not in the list) shows the declined state, not "Loading"', async () => {
    getChallenge.mockResolvedValue({ ...base, status: 'DECLINED' })
    panel([])
    expect(await screen.findByText('Ary declined your challenge.')).toBeTruthy()
    expect(screen.queryByText('Loading the match…')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Find another rival' })
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to PvP' })).toBeTruthy()
  })

  it('"Find another rival" goes to the distance step', async () => {
    getChallenge.mockResolvedValue({ ...base, status: 'DECLINED' })
    panel([])
    fireEvent.click(
      await screen.findByRole('button', { name: 'Find another rival' })
    )
    expect(await screen.findByText(/distance|How far/i)).toBeTruthy()
  })

  it('cancelled challenge', async () => {
    getChallenge.mockResolvedValue({
      ...base,
      status: 'CANCELLED',
      expiresAt: '2999-01-01T00:00:00',
    })
    panel([])
    expect(await screen.findByText('Challenge cancelled')).toBeTruthy()
  })

  it('expired (timed out while waiting) challenge', async () => {
    getChallenge.mockResolvedValue({
      ...base,
      status: 'CANCELLED',
      expiresAt: '2020-01-01T00:00:00',
    })
    panel([])
    expect(await screen.findByText('Challenge expired')).toBeTruthy()
  })

  it('unknown race (404) shows a friendly message, not a spinner', async () => {
    getChallenge.mockRejectedValue(new ApiError('gone', 404))
    panel([])
    expect(await screen.findByText(/could not find that race/i)).toBeTruthy()
    expect(screen.queryByText('Loading the match…')).toBeNull()
  })

  it('waiting for the rival still shows the cancel button', async () => {
    getChallenge.mockResolvedValue(base)
    panel([base])
    expect(
      await screen.findByRole('button', { name: 'Cancel challenge' })
    ).toBeTruthy()
  })
})
