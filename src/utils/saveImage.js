// Saving a run image on the phone. A blob URL + <a download> does nothing
// inside the Capacitor WebView, so the native app writes the PNG/JPG to a
// cache file and hands it to the OS instead:
//   - "Save to Photos": @capacitor-community/media savePhoto (Capacitor 6,
//     Android + iOS) - the "Run Conquest" album on Android, the camera roll
//     on iOS (add-only permission; picking an album there would need
//     getAlbums(), i.e. full photo-library access, so it is skipped).
//   - "Share": @capacitor/share with the file (the fallback, and its own
//     button) - the user can pick "Save Image" there.
// The web keeps using downloadBlob() in shareCanvas.js, untouched.
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Media } from '@capacitor-community/media'
import { Share } from '@capacitor/share'
import {
  NativeSettings,
  AndroidSettings,
  IOSSettings,
} from 'capacitor-native-settings'
import { platform } from './geo'

export const ALBUM_NAME = 'Run Conquest'

export const SAVE_STATUS = Object.freeze({
  SAVED: 'saved',
  SHARED: 'shared',
  CANCELLED: 'cancelled',
  PERMISSION_DENIED: 'permission-denied',
})

// Blob -> bare base64 (no data: prefix), which is what Filesystem.writeFile
// wants for binary data. Chunked so a large PNG doesn't blow the call stack.
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function writeCacheFile(blob, filename) {
  const data = await blobToBase64(blob)
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
  })
  return uri
}

function isPermissionError(err) {
  return /denied|permission|authori[sz]/i.test(String(err?.message ?? err))
}

function isCancelled(err) {
  return /cancel/i.test(String(err?.message ?? err))
}

// Android's albums are plain folders under Pictures; createAlbum() makes the
// folder (it rejects when it already exists, which is fine) and the folder
// path is the album identifier savePhoto wants.
async function androidAlbumIdentifier() {
  const { path } = await Media.getAlbumsPath()
  try {
    await Media.createAlbum({ name: ALBUM_NAME })
  } catch (err) {
    if (!/exist/i.test(String(err?.message ?? err))) throw err
  }
  return `${path.replace(/\/+$/, '')}/${ALBUM_NAME}`
}

// Share sheet with the image file. `cancelled` when the user backs out.
export async function shareImageFile(blob, filename) {
  const uri = await writeCacheFile(blob, filename)
  try {
    await Share.share({ title: ALBUM_NAME, files: [uri] })
    return { status: SAVE_STATUS.SHARED }
  } catch (err) {
    if (isCancelled(err)) return { status: SAVE_STATUS.CANCELLED }
    throw err
  }
}

// Save to the phone's gallery. Resolves { status } - SAVED, PERMISSION_DENIED
// (the caller offers "Open settings"), or whatever the share-sheet fallback
// returns when the gallery save fails for a non-permission reason.
export async function saveImageToPhotos(blob, filename) {
  const uri = await writeCacheFile(blob, filename)
  try {
    const options = {
      path: uri,
      fileName: filename.replace(/\.[^.]+$/, ''),
    }
    if (platform === 'android') {
      options.albumIdentifier = await androidAlbumIdentifier()
    }
    await Media.savePhoto(options)
  } catch (err) {
    if (isPermissionError(err)) {
      return { status: SAVE_STATUS.PERMISSION_DENIED }
    }
    // Anything else (no gallery plugin support on this device, odd storage
    // state...): let the user save it from the share sheet instead.
    return shareImageFile(blob, filename)
  }
  // Best effort - the OS clears the cache anyway.
  Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(
    () => {}
  )
  return { status: SAVE_STATUS.SAVED }
}

export function openAppSettings() {
  return NativeSettings.open({
    optionAndroid: AndroidSettings.ApplicationDetails,
    optionIOS: IOSSettings.App,
  })
}
