// Saving a run image on the phone. A blob URL + <a download> does nothing
// inside the Capacitor WebView, so the native app writes the PNG/JPG to a
// cache file and hands it to the OS instead:
//   - "Save to Photos":
//       Android - our own GallerySave plugin (GallerySavePlugin.java): a
//       MediaStore insert into Pictures/Run Conquest on Android 10+ with NO
//       storage permission (a legacy storage permission is requested only on
//       Android 9 and below).
//       iOS - @capacitor-community/media savePhoto into the camera roll
//       (add-only permission; picking an album there would need getAlbums(),
//       i.e. full photo-library access, so it is skipped).
//   - "Share": @capacitor/share with the file (the fallback, and its own
//     button) - the user can pick "Save Image" there.
// The web keeps using downloadBlob() in shareCanvas.js, untouched.
import { registerPlugin } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Media } from '@capacitor-community/media'
import { Share } from '@capacitor/share'
import {
  NativeSettings,
  AndroidSettings,
  IOSSettings,
} from 'capacitor-native-settings'
import { platform } from './geo'
import { EXPORT_MESSAGES } from '../hooks/useExportAction'

export const ALBUM_NAME = 'Run Conquest'

// Android gallery save (android/.../GallerySavePlugin.java).
const GallerySave = registerPlugin('GallerySave')

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

function mimeTypeOf(blob, filename) {
  if (blob?.type) return blob.type
  return /\.jpe?g$/i.test(filename) ? 'image/jpeg' : 'image/png'
}

function isPermissionError(err) {
  return /denied|permission|authori[sz]/i.test(String(err?.message ?? err))
}

function isCancelled(err) {
  return /cancel/i.test(String(err?.message ?? err))
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
    const fileName = filename.replace(/\.[^.]+$/, '')
    if (platform === 'android') {
      await GallerySave.saveImage({
        path: uri,
        fileName,
        mimeType: mimeTypeOf(blob, filename),
        album: ALBUM_NAME,
      })
    } else {
      await Media.savePhoto({ path: uri, fileName })
    }
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

// What a save/share result means for the export button (see
// hooks/useExportAction.js): the message to show, or `silent` when the user
// just closed the share sheet, or `permissionDenied` (the button offers Open
// Settings).
export function outcomeFromSave(result, platformName = platform) {
  switch (result?.status) {
    case SAVE_STATUS.CANCELLED:
      return { silent: true }
    case SAVE_STATUS.PERMISSION_DENIED:
      return { permissionDenied: true }
    case SAVE_STATUS.SHARED:
      return { message: EXPORT_MESSAGES.shared }
    default:
      return {
        message:
          platformName === 'android'
            ? EXPORT_MESSAGES.savedGallery
            : EXPORT_MESSAGES.saved,
      }
  }
}
