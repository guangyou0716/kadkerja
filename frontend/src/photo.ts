/** Photo checks and shrinking in the browser, before anything is sent. */

/** The server's limit for one file; a shrunk photo is far below it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** What a phone may hand over before shrinking (a 48 MP camera's JPEG is about 15 MB). */
export const MAX_PICKED_BYTES = 25 * 1024 * 1024
export const MAX_SIDE = 1600
export const MAX_PHOTOS = 12
export const ACCEPTED = ['image/jpeg', 'image/png']

/** Why a picked file cannot be used (a message key), or null if it can. */
export function photoProblem(file: File): 'photos.wrongType' | 'photos.tooBigPicked' | null {
  if (!ACCEPTED.includes(file.type)) return 'photos.wrongType'
  if (file.size > MAX_PICKED_BYTES) return 'photos.tooBigPicked'
  return null
}

/**
 * A JPEG of at most 1600 px on the long side, drawn upright (the browser applies the camera's
 * rotation) and without the camera's metadata such as GPS position. Where the browser cannot do
 * this, the file is sent as it is and the server shrinks it (and strips metadata) itself.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Not readable here; let the server decide (it refuses what is not a real JPEG or PNG).
    return file
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  return blob ?? file
}
