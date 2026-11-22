import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The download button's state machine (idle -> loading -> success | error |
// permission-denied) driven through the REAL save path with every Capacitor
// plugin mocked.
const fs = vi.hoisted(() => ({ writeFile: vi.fn(), deleteFile: vi.fn() }))
const media = vi.hoisted(() => ({
  savePhoto: vi.fn(),
  getAlbumsPath: vi.fn(),
  createAlbum: vi.fn(),
}))
const gallery = vi.hoisted(() => ({ saveImage: vi.fn() }))
const share = vi.hoisted(() => ({ share: vi.fn() }))
const geo = vi.hoisted(() => ({ platform: 'android' }))

vi.mock('@capacitor/core', () => ({ registerPlugin: () => gallery }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: fs,
  Directory: { Cache: 'CACHE' },
}))
vi.mock('@capacitor-community/media', () => ({ Media: media }))
vi.mock('@capacitor/share', () => ({ Share: share }))
vi.mock('capacitor-native-settings', () => ({
  NativeSettings: { open: vi.fn() },
  AndroidSettings: { ApplicationDetails: 'a' },
  IOSSettings: { App: 'i' },
}))
vi.mock('../utils/geo', () => ({
  get platform() {
    return geo.platform
  },
  isNative: true,
}))
vi.mock('../utils/gameSound', () => ({
  isSfxMuted: () => true,
  playSfx: vi.fn(),
}))

import ExportButton from '../components/ExportButton'
import {
  EXPORT_MESSAGES,
  EXPORT_STATE,
  useExportAction,
} from './useExportAction'
import { outcomeFromSave, saveImageToPhotos } from '../utils/saveImage'

// jsdom's Blob has no arrayBuffer(); the save path only needs that.
const blob = {
  type: 'image/png',
  arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
}
const FAST = { minLoadingMs: 5, successMs: 40, sound: false }

beforeEach(() => {
  vi.clearAllMocks()
  geo.platform = 'android'
  fs.writeFile.mockResolvedValue({ uri: 'file:///cache/x.png' })
  fs.deleteFile.mockResolvedValue({})
  media.getAlbumsPath.mockResolvedValue({ path: '/storage/Pictures' })
  media.createAlbum.mockResolvedValue()
  media.savePhoto.mockResolvedValue({})
  gallery.saveImage.mockResolvedValue({
    uri: 'content://media/external/images/1',
  })
  share.share.mockResolvedValue({})
})
afterEach(cleanup)

// The same call chain the carousel's Download button makes.
const savePng = async () =>
  outcomeFromSave(await saveImageToPhotos(blob, 'x.png'))

describe('outcomeFromSave', () => {
  it('Android says Gallery, iPhone says Photos', () => {
    expect(outcomeFromSave({ status: 'saved' }, 'android').message).toBe(
      'Saved to Gallery'
    )
    expect(outcomeFromSave({ status: 'saved' }, 'ios').message).toBe(
      'Saved to Photos'
    )
  })
  it('denied -> permissionDenied; cancelled -> silent; shared -> Shared', () => {
    expect(outcomeFromSave({ status: 'permission-denied' })).toEqual({
      permissionDenied: true,
    })
    expect(outcomeFromSave({ status: 'cancelled' })).toEqual({ silent: true })
    expect(outcomeFromSave({ status: 'shared' }).message).toBe('Shared')
  })
})

describe('useExportAction state machine', () => {
  it('idle -> loading (immediately) -> success -> idle again after the reset', async () => {
    const { result } = renderHook(() => useExportAction(savePng, FAST))
    expect(result.current.state).toBe(EXPORT_STATE.IDLE)
    act(() => {
      result.current.trigger()
    })
    expect(result.current.state).toBe(EXPORT_STATE.LOADING)
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.state).toBe(EXPORT_STATE.SUCCESS))
    expect(result.current.message).toBe('Saved to Gallery')
    expect(gallery.saveImage).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.state).toBe(EXPORT_STATE.IDLE))
  })

  it('a second tap while loading is ignored (no double save)', async () => {
    const { result } = renderHook(() => useExportAction(savePng, FAST))
    await act(async () => {
      result.current.trigger()
      result.current.trigger()
      result.current.trigger()
    })
    await waitFor(() => expect(result.current.state).toBe(EXPORT_STATE.SUCCESS))
    expect(gallery.saveImage).toHaveBeenCalledTimes(1)
  })

  it('an unexpected failure ends in the error state with the plain message, then retry works', async () => {
    const onNotify = vi.fn()
    let n = 0
    const run = vi.fn(async () => {
      if (n++ === 0) throw new Error('boom')
      return { message: EXPORT_MESSAGES.saved }
    })
    const { result } = renderHook(() =>
      useExportAction(run, { ...FAST, onNotify })
    )
    await act(async () => {
      await result.current.trigger()
    })
    expect(result.current.state).toBe(EXPORT_STATE.ERROR)
    expect(result.current.message).toBe(
      "Couldn't save. Check Photos permission and try again."
    )
    expect(result.current.permissionDenied).toBe(false)
    expect(onNotify).toHaveBeenCalledWith({
      type: 'error',
      message: EXPORT_MESSAGES.failedShort,
    })
    // Retry from the error state.
    await act(async () => {
      await result.current.trigger()
    })
    expect(result.current.state).toBe(EXPORT_STATE.SUCCESS)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('permission denied (plugin rejects) -> error + permissionDenied, never a silent failure', async () => {
    gallery.saveImage.mockRejectedValue(new Error('Storage permission denied'))
    const onNotify = vi.fn()
    const { result } = renderHook(() =>
      useExportAction(savePng, { ...FAST, onNotify })
    )
    await act(async () => {
      await result.current.trigger()
    })
    expect(result.current.state).toBe(EXPORT_STATE.ERROR)
    expect(result.current.permissionDenied).toBe(true)
    expect(onNotify).toHaveBeenCalledWith({
      type: 'error',
      message: 'Photos access is off',
    })
    expect(share.share).not.toHaveBeenCalled() // no fallback sheet for a denied permission
  })

  it('a non-permission plugin failure falls back to the share sheet instead of failing silently', async () => {
    gallery.saveImage.mockRejectedValue(new Error('disk exploded'))
    const { result } = renderHook(() => useExportAction(savePng, FAST))
    await act(async () => {
      await result.current.trigger()
    })
    expect(share.share).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe(EXPORT_STATE.SUCCESS)
    expect(result.current.message).toBe('Shared')
  })

  it('the user closing the share sheet returns to idle with no message', async () => {
    share.share.mockRejectedValue(new Error('Share canceled'))
    const onNotify = vi.fn()
    const run = async () =>
      outcomeFromSave(
        await (await import('../utils/saveImage')).shareImageFile(blob, 'x.png')
      )
    const { result } = renderHook(() =>
      useExportAction(run, { ...FAST, onNotify })
    )
    await act(async () => {
      await result.current.trigger()
    })
    expect(result.current.state).toBe(EXPORT_STATE.IDLE)
    expect(onNotify).not.toHaveBeenCalled()
  })

  it('times out instead of spinning forever', async () => {
    const run = () => new Promise(() => {})
    const { result } = renderHook(() =>
      useExportAction(run, { ...FAST, timeoutMs: 30 })
    )
    await act(async () => {
      await result.current.trigger()
    })
    expect(result.current.state).toBe(EXPORT_STATE.ERROR)
  })
})

describe('ExportButton labels', () => {
  function setup(run) {
    render(
      <ExportButton
        className="btn"
        idleLabel="Download PNG"
        loadingLabel="Saving..."
        run={run}
        timeoutMs={null}
        testId="dl"
      >
        {({ permissionDenied }) =>
          permissionDenied ? <p>Photos access is off</p> : null
        }
      </ExportButton>
    )
    return screen.getByTestId('dl')
  }

  it('Download PNG -> Saving... (disabled) -> Saved to Gallery', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    const btn = setup(async () => {
      await gate
      return { message: 'Saved to Gallery' }
    })
    expect(btn).toHaveTextContent('Download PNG')
    expect(btn).toBeEnabled()
    await userEvent.click(btn)
    expect(btn).toHaveTextContent('Saving...')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    await act(async () => release())
    await waitFor(() => expect(btn).toHaveTextContent('Saved to Gallery'))
    expect(btn).toHaveAttribute('data-state', 'success')
  })

  it('error -> "Retry" button + the plain message underneath', async () => {
    const btn = setup(async () => {
      throw new Error('nope')
    })
    await userEvent.click(btn)
    await waitFor(() => expect(btn).toHaveAttribute('data-state', 'error'))
    expect(btn).toHaveTextContent('Retry')
    expect(btn).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save. Check Photos permission and try again."
    )
  })

  it('permission denied -> no generic alert, the permission block shows instead', async () => {
    const btn = setup(async () => ({ permissionDenied: true }))
    await userEvent.click(btn)
    await waitFor(() => expect(btn).toHaveAttribute('data-state', 'error'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Photos access is off')).toBeInTheDocument()
  })
})
