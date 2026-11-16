import { randomBytes } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { HttpError } from './errors.js'
import type { Storage } from './storage.js'

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // Vercel functions cap request bodies at ~4.5 MB
const ALLOWED = new Map<string, { ext: string; mime: string }>([
  ['jpeg', { ext: 'jpg', mime: 'image/jpeg' }],
  ['png', { ext: 'png', mime: 'image/png' }],
  ['webp', { ext: 'webp', mime: 'image/webp' }],
  ['gif', { ext: 'gif', mime: 'image/gif' }],
])
const VARIANT_WIDTHS = [480, 960, 1600]

export interface StoredImage {
  filename: string
  key: string
  url: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  variants: { width: number; key: string; url: string }[]
}

/** Validates by decoding the actual bytes (not the client-supplied type), stores the original and WebP variants. */
export async function storeImage(storage: Storage, original: { buffer: Buffer; originalname: string }): Promise<StoredImage> {
  if (original.buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(422, 'File too large (max 4 MB)')
  let meta: Metadata
  try {
    meta = await sharp(original.buffer, { animated: false }).metadata()
  } catch {
    throw new HttpError(422, 'Not a valid image file')
  }
  const kind = meta.format ? ALLOWED.get(meta.format) : undefined
  if (!kind) throw new HttpError(422, 'Unsupported image type (jpg, png, gif or webp only)')

  const now = new Date()
  const base = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${Date.now()}-${randomBytes(4).toString('hex')}`
  const key = `${base}.${kind.ext}`
  const written: string[] = []
  try {
    await storage.put(key, original.buffer, kind.mime)
    written.push(key)

    const variants: StoredImage['variants'] = []
    if (meta.format !== 'gif' && meta.width) {
      for (const w of VARIANT_WIDTHS) {
        if (w >= meta.width) continue
        const buf = await sharp(original.buffer).rotate().resize({ width: w }).webp({ quality: 78 }).toBuffer()
        const vKey = `${base}-${w}.webp`
        await storage.put(vKey, buf, 'image/webp')
        written.push(vKey)
        variants.push({ width: w, key: vKey, url: storage.url(vKey) })
      }
    }
    return {
      filename: original.originalname.slice(0, 200),
      key,
      url: storage.url(key),
      mimeType: kind.mime,
      size: original.buffer.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      variants,
    }
  } catch (err) {
    await Promise.allSettled(written.map((k) => storage.remove(k)))
    throw err
  }
}
