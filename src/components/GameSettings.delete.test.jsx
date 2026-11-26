// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ deleteMyAccount: vi.fn() }))
const session = vi.hoisted(() => ({ clearSession: vi.fn() }))
const google = vi.hoisted(() => ({ googleSignOut: vi.fn(async () => {}) }))
vi.mock('../utils/googleSession', () => google)
vi.mock('../api/user', () => api)
vi.mock('../api/client', async (orig) => ({
  ...(await orig()),
  clearSession: session.clearSession,
}))
vi.mock('../game/ui/Toast', () => ({ useToast: () => vi.fn() }))
vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn().mockResolvedValue({ version: '1' }) },
}))

import GameSettings from './GameSettings'
import { ApiError } from '../api/client'
import { DELETE_ACCOUNT_COPY } from '../utils/deleteAccount'

const props = () => ({
  audio: {
    musicVolume: 1,
    sfxVolume: 1,
    musicMuted: false,
    sfxMuted: false,
    changeMusic: vi.fn(),
    changeSfx: vi.fn(),
    toggleMusicMute: vi.fn(),
    toggleSfxMute: vi.fn(),
  },
  push: { supported: false },
  mapStyles: [],
  mapStyleId: null,
  onSelectMapStyle: vi.fn(),
  pvp: {
    discoverable: false,
    busy: null,
    error: '',
    toggleDiscoverable: vi.fn(),
  },
  onEditProfile: vi.fn(),
  onHowToPlay: vi.fn(),
  onOpenLegal: vi.fn(),
  onLogout: vi.fn(),
  onAccountDeleted: vi.fn(),
})

afterEach(cleanup)
beforeEach(() => {
  api.deleteMyAccount.mockReset()
  session.clearSession.mockReset()
  google.googleSignOut.mockClear()
})

async function openDialog(p) {
  render(<GameSettings {...p} />)
  await userEvent.click(screen.getByTestId('delete-account-btn'))
}

describe('Settings > Delete account', () => {
  it('shows exactly what gets deleted before anything is sent', async () => {
    await openDialog(props())
    expect(screen.getByText(DELETE_ACCOUNT_COPY.intro)).toBeTruthy()
    expect(screen.getByTestId('delete-account-list').children).toHaveLength(
      DELETE_ACCOUNT_COPY.deletes.length
    )
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
  })

  it('"Keep my account" closes the dialog and sends nothing', async () => {
    await openDialog(props())
    await userEvent.click(screen.getByText(DELETE_ACCOUNT_COPY.keep))
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
    expect(session.clearSession).not.toHaveBeenCalled()
  })

  it('confirm: DELETE /v1/user/me, then clears the session and returns to login', async () => {
    const p = props()
    api.deleteMyAccount.mockResolvedValue(null)
    await openDialog(p)
    await userEvent.click(screen.getByTestId('delete-account-confirm'))
    await waitFor(() => expect(p.onAccountDeleted).toHaveBeenCalledTimes(1))
    expect(api.deleteMyAccount).toHaveBeenCalledTimes(1)
    expect(session.clearSession).toHaveBeenCalledTimes(1)
    // Google account forgotten too: the next sign-in is a clean new account.
    expect(google.googleSignOut).toHaveBeenCalledTimes(1)
  })

  it('server failure: account untouched, session kept, retry possible', async () => {
    const p = props()
    api.deleteMyAccount.mockRejectedValue(new ApiError('boom', 500))
    await openDialog(p)
    await userEvent.click(screen.getByTestId('delete-account-confirm'))
    expect(
      (await screen.findByTestId('delete-account-error')).textContent
    ).toBe(DELETE_ACCOUNT_COPY.failed)
    expect(session.clearSession).not.toHaveBeenCalled()
    expect(p.onAccountDeleted).not.toHaveBeenCalled()
    expect(screen.getByTestId('delete-account-confirm').disabled).toBe(false)
  })

  it('offline: a connection message, session kept', async () => {
    const p = props()
    api.deleteMyAccount.mockRejectedValue(new ApiError('down', 0))
    await openDialog(p)
    await userEvent.click(screen.getByTestId('delete-account-confirm'))
    expect(
      (await screen.findByTestId('delete-account-error')).textContent
    ).toMatch(/No connection/)
    expect(session.clearSession).not.toHaveBeenCalled()
  })
})
