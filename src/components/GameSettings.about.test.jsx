// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../api/user', () => ({ deleteMyAccount: vi.fn() }))
vi.mock('../utils/googleSession', () => ({ googleSignOut: vi.fn() }))
vi.mock('../game/ui/Toast', () => ({ useToast: () => vi.fn() }))
vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn().mockResolvedValue({ version: '1.1.1', build: '12' }),
  },
}))

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

async function renderAbout() {
  vi.resetModules()
  const { default: GameSettings } = await import('./GameSettings')
  const { recordRolloutCheck } = await import('../utils/rolloutDebug')
  recordRolloutCheck({
    trigger: 't',
    lat: 27.7,
    lng: 85.3,
    ok: true,
    decision: 'x',
  })
  return render(<GameSettings {...props()} />)
}

beforeEach(() => {
  vi.stubEnv('VITE_BACKEND_TARGET', 'test')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('Settings > About diagnostics', () => {
  it('release/staging build: no API line, no rollout check, no coordinates, no "test" label', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEBUG_INFO', '')
    const { container } = await renderAbout()
    expect(screen.queryByTestId('rollout-debug')).toBeNull()
    expect(container.textContent).not.toMatch(/API:|Rollout check|27\.7|85\.3/)
    expect(screen.getByTestId('app-version').textContent).not.toMatch(/test/)
  })

  it('shown with VITE_DEBUG_INFO=1', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEBUG_INFO', '1')
    const { container } = await renderAbout()
    expect(screen.getByTestId('rollout-debug')).toBeTruthy()
    expect(container.textContent).toMatch(/API:/)
    expect(container.textContent).toMatch(/Rollout check/)
  })

  it('shown in the dev server', async () => {
    vi.stubEnv('DEV', true)
    await renderAbout()
    expect(screen.getByTestId('rollout-debug')).toBeTruthy()
  })

  it('web build shows the package version, never the word "Web"', async () => {
    vi.stubEnv('DEV', false)
    await renderAbout()
    const v = screen.getByTestId('app-version').textContent
    expect(v).toMatch(/^\d+\.\d+\.\d+/)
    expect(v).not.toBe('Web')
  })
})

describe('release env files', () => {
  it('never set VITE_DEBUG_INFO', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['.env.production', '.env.staging'])
      expect(readFileSync(f, 'utf8')).not.toMatch(/^VITE_DEBUG_INFO\s*=/m)
  })
})
