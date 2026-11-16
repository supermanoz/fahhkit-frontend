import { beforeEach, describe, expect, it, vi } from 'vitest'

// Native branch of saving a run image, with every Capacitor plugin mocked.
const fs = vi.hoisted(() => ({
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}))
const media = vi.hoisted(() => ({
  savePhoto: vi.fn(),
  getAlbumsPath: vi.fn(),
  createAlbum: vi.fn(),
}))
const share = vi.hoisted(() => ({ share: vi.fn() }))
const settings = vi.hoisted(() => ({ open: vi.fn() }))
const geo = vi.hoisted(() => ({ platform: 'android' }))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: fs,
  Directory: { Cache: 'CACHE' },
}))
vi.mock('@capacitor-community/media', () => ({ Media: media }))
vi.mock('@capacitor/share', () => ({ Share: share }))
vi.mock('capacitor-native-settings', () => ({
  NativeSettings: settings,
  AndroidSettings: { ApplicationDetails: 'app-details' },
  IOSSettings: { App: 'app' },
}))
vi.mock('./geo', () => ({
  get platform() {
    return geo.platform
  },
  isNative: true,
}))

import {
  SAVE_STATUS,
  blobToBase64,
  openAppSettings,
  saveImageToPhotos,
  shareImageFile,
} from './saveImage'

const FILE = 'run-conquest-run-7-transparent.png'
const blob = new Blob([new Uint8Array([137, 80, 78, 71])], {
  type: 'image/png',
})

beforeEach(() => {
  vi.clearAllMocks()
  geo.platform = 'android'
  fs.writeFile.mockResolvedValue({ uri: `file:///cache/${FILE}` })
  fs.deleteFile.mockResolvedValue({})
  media.getAlbumsPath.mockResolvedValue({ path: '/storage/Pictures/' })
  media.createAlbum.mockResolvedValue()
  media.savePhoto.mockResolvedValue({ filePath: 'x' })
  share.share.mockResolvedValue({})
})

describe('blobToBase64', () => {
  it('returns bare base64 (no data: prefix)', async () => {
    expect(await blobToBase64(blob)).toBe('iVBORw==')
  })
})

describe('saveImageToPhotos', () => {
  it('Android: writes the cache file, makes the album, saves into it', async () => {
    const r = await saveImageToPhotos(blob, FILE)
    expect(r).toEqual({ status: SAVE_STATUS.SAVED })
    expect(fs.writeFile).toHaveBeenCalledWith({
      path: FILE,
      data: 'iVBORw==',
      directory: 'CACHE',
    })
    expect(media.createAlbum).toHaveBeenCalledWith({ name: 'Run Conquest' })
    expect(media.savePhoto).toHaveBeenCalledWith({
      path: `file:///cache/${FILE}`,
      fileName: 'run-conquest-run-7-transparent',
      albumIdentifier: '/storage/Pictures/Run Conquest',
    })
    expect(fs.deleteFile).toHaveBeenCalled()
  })

  it('Android: an album that already exists is fine', async () => {
    media.createAlbum.mockRejectedValue(new Error('Album already exists'))
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.SAVED)
  })

  it('iOS: saves to the camera roll with no album lookup (add-only)', async () => {
    geo.platform = 'ios'
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.SAVED)
    expect(media.getAlbumsPath).not.toHaveBeenCalled()
    expect(media.createAlbum).not.toHaveBeenCalled()
    expect(media.savePhoto).toHaveBeenCalledWith({
      path: `file:///cache/${FILE}`,
      fileName: 'run-conquest-run-7-transparent',
    })
  })

  it('a denied permission is reported, not shared', async () => {
    media.savePhoto.mockRejectedValue(
      new Error('Unable to access media, user denied permission request')
    )
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.PERMISSION_DENIED)
    expect(share.share).not.toHaveBeenCalled()
  })

  it('any other save failure falls back to the share sheet', async () => {
    media.savePhoto.mockRejectedValue(new Error('Error occurred: disk full'))
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.SHARED)
    expect(share.share).toHaveBeenCalledWith({
      title: 'Run Conquest',
      files: [`file:///cache/${FILE}`],
    })
  })

  it('keeps the JPG extension for the map card', async () => {
    await saveImageToPhotos(blob, 'run-conquest-run-7-map.jpg')
    expect(media.savePhoto.mock.calls[0][0].fileName).toBe(
      'run-conquest-run-7-map'
    )
  })
})

describe('shareImageFile', () => {
  it('shares the cached file', async () => {
    expect(await shareImageFile(blob, FILE)).toEqual({
      status: SAVE_STATUS.SHARED,
    })
  })
  it('backing out of the share sheet is not an error', async () => {
    share.share.mockRejectedValue(new Error('Share canceled'))
    expect(await shareImageFile(blob, FILE)).toEqual({
      status: SAVE_STATUS.CANCELLED,
    })
  })
  it('real share errors propagate', async () => {
    share.share.mockRejectedValue(new Error('boom'))
    await expect(shareImageFile(blob, FILE)).rejects.toThrow('boom')
  })
})

describe('openAppSettings', () => {
  it('opens this app’s settings page', async () => {
    await openAppSettings()
    expect(settings.open).toHaveBeenCalledWith({
      optionAndroid: 'app-details',
      optionIOS: 'app',
    })
  })
})
