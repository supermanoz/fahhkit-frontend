// The API's nginx rejects request bodies over ~1 MB with a 413 that carries no
// CORS headers, so the browser surfaces it as a network error ("Could not
// reach the server") instead of a size error. Phone photos are routinely
// 2–5 MB, so every multipart upload is squeezed under this budget first.
export const MAX_UPLOAD_BYTES = 900 * 1024

const MAX_EDGE_STEPS = [1600, 1280, 1024, 800, 640]
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45]

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through to <img> decoding (e.g. older Safari).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(source, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')
  // JPEG has no alpha; paint white so transparent PNGs don't turn black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// Re-encodes an image File as JPEG, stepping down size/quality until it fits
// in `budget` bytes. Files already under budget, non-images and GIFs
// (animation would be lost) are returned untouched.
export async function compressImage(file, budget) {
  if (
    !(file instanceof File) ||
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.size <= budget
  ) {
    return file
  }

  let source
  try {
    source = await loadBitmap(file)
  } catch {
    return file
  }

  let best = null
  for (const edge of MAX_EDGE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(source, edge, quality)
      if (!blob) continue
      if (!best || blob.size < best.size) best = blob
      if (blob.size <= budget) {
        source.close?.()
        return toFile(blob, file.name)
      }
    }
  }
  source.close?.()
  return best && best.size < file.size ? toFile(best, file.name) : file
}

function toFile(blob, name) {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

// Returns a copy of `formData` with every image shrunk so the whole body
// stays under MAX_UPLOAD_BYTES, splitting the budget across all images.
export async function compressFormDataImages(formData) {
  const entries = [...formData.entries()]
  const images = entries.filter(
    ([, v]) => v instanceof File && v.type.startsWith('image/')
  )
  if (images.length === 0) return formData

  const textBytes = entries
    .filter(([, v]) => typeof v === 'string')
    .reduce((sum, [k, v]) => sum + k.length + v.length + 200, 0)
  const perImage = Math.max(
    64 * 1024,
    Math.floor((MAX_UPLOAD_BYTES - textBytes) / images.length)
  )

  const out = new FormData()
  for (const [key, value] of entries) {
    if (value instanceof File && value.type.startsWith('image/')) {
      const compressed = await compressImage(value, perImage)
      out.append(key, compressed, compressed.name)
    } else {
      out.append(key, value)
    }
  }
  return out
}

export function formDataFileBytes(formData) {
  let total = 0
  for (const [, value] of formData.entries()) {
    if (value instanceof Blob) total += value.size
  }
  return total
}
