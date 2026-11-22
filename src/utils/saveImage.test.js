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
const gallery = vi.hoisted(() => ({ saveImage: vi.fn() }))
const share = vi.hoisted(() => ({ share: vi.fn() }))
const settings = vi.hoisted(() => ({ open: vi.fn() }))
const geo = vi.hoisted(() => ({ platform: 'android' }))

// Android's own GallerySave plugin (registerPlugin('GallerySave')).
vi.mock('@capacitor/core', () => ({ registerPlugin: () => gallery }))
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
  gallery.saveImage.mockResolvedValue({
    uri: 'content://media/external/images/1',
  })
  share.share.mockResolvedValue({})
})

describe('blobToBase64', () => {
  it('returns bare base64 (no data: prefix)', async () => {
    expect(await blobToBase64(blob)).toBe('iVBORw==')
  })
})

describe('saveImageToPhotos', () => {
  it('Android: writes the cache file and saves through the GallerySave plugin', async () => {
    const r = await saveImageToPhotos(blob, FILE)
    expect(r).toEqual({ status: SAVE_STATUS.SAVED })
    expect(fs.writeFile).toHaveBeenCalledWith({
      path: FILE,
      data: 'iVBORw==',
      directory: 'CACHE',
    })
    expect(gallery.saveImage).toHaveBeenCalledWith({
      path: `file:///cache/${FILE}`,
      fileName: 'run-conquest-run-7-transparent',
      mimeType: 'image/png',
      album: 'Run Conquest',
    })
    expect(fs.deleteFile).toHaveBeenCalled()
  })

  it('Android: never goes through the community media plugin (no album lookup, no photos permission)', async () => {
    await saveImageToPhotos(blob, FILE)
    expect(media.savePhoto).not.toHaveBeenCalled()
    expect(media.getAlbumsPath).not.toHaveBeenCalled()
    expect(media.createAlbum).not.toHaveBeenCalled()
  })

  it('iOS: unchanged - saves to the camera roll with the community plugin (add-only)', async () => {
    geo.platform = 'ios'
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.SAVED)
    expect(gallery.saveImage).not.toHaveBeenCalled()
    expect(media.getAlbumsPath).not.toHaveBeenCalled()
    expect(media.createAlbum).not.toHaveBeenCalled()
    expect(media.savePhoto).toHaveBeenCalledWith({
      path: `file:///cache/${FILE}`,
      fileName: 'run-conquest-run-7-transparent',
    })
  })

  it('Android: a denied (Android 9 and below) storage permission is reported, not shared', async () => {
    gallery.saveImage.mockRejectedValue(
      Object.assign(new Error('Storage permission denied'), {
        code: 'PERMISSION_DENIED',
      })
    )
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.PERMISSION_DENIED)
    expect(share.share).not.toHaveBeenCalled()
  })

  it('iOS: a denied photos permission is reported, not shared', async () => {
    geo.platform = 'ios'
    media.savePhoto.mockRejectedValue(
      new Error('Unable to access media, user denied permission request')
    )
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.PERMISSION_DENIED)
    expect(share.share).not.toHaveBeenCalled()
  })

  it('any other save failure falls back to the share sheet', async () => {
    gallery.saveImage.mockRejectedValue(
      new Error('Could not save image: disk full')
    )
    const r = await saveImageToPhotos(blob, FILE)
    expect(r.status).toBe(SAVE_STATUS.SHARED)
    expect(share.share).toHaveBeenCalledWith({
      title: 'Run Conquest',
      files: [`file:///cache/${FILE}`],
    })
  })

  it('keeps the JPG extension and mime type for the map card', async () => {
    const jpg = new Blob([new Uint8Array([255, 216])], { type: 'image/jpeg' })
    await saveImageToPhotos(jpg, 'run-conquest-run-7-map.jpg')
    expect(gallery.saveImage.mock.calls[0][0]).toMatchObject({
      fileName: 'run-conquest-run-7-map',
      mimeType: 'image/jpeg',
    })
  })

  it('falls back to the file extension when the blob has no type', async () => {
    const untyped = { arrayBuffer: async () => new Uint8Array([1]).buffer }
    await saveImageToPhotos(untyped, 'a.jpg')
    expect(gallery.saveImage.mock.calls[0][0].mimeType).toBe('image/jpeg')
    await saveImageToPhotos(untyped, 'a.png')
    expect(gallery.saveImage.mock.calls[1][0].mimeType).toBe('image/png')
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
