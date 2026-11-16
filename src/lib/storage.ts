import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config } from '../config.js'
import { HttpError } from './errors.js'

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  remove(key: string): Promise<void>
  url(key: string): string
}

class R2Storage implements Storage {
  private client: S3Client
  constructor(
    private bucket: string,
    private publicUrl: string,
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
  url(key: string) {
    return `${this.publicUrl}/${key}`
  }
}

/** In-memory driver, selectable only with STORAGE_DRIVER=memory (tests / local dev). */
export class MemoryStorage implements Storage {
  files = new Map<string, { body: Buffer; contentType: string }>()
  async put(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType })
  }
  async remove(key: string) {
    this.files.delete(key)
  }
  url(key: string) {
    return `https://media.test.invalid/${key}`
  }
}

/** Local development only: writes files to a folder you serve yourself (STORAGE_DRIVER=disk). */
export class DiskStorage implements Storage {
  constructor(private dir: string, private publicUrl: string) {}
  async put(key: string, body: Buffer) {
    const file = path.join(this.dir, key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body)
  }
  async remove(key: string) {
    await rm(path.join(this.dir, key), { force: true })
  }
  url(key: string) {
    return `${this.publicUrl}/${key}`
  }
}

let instance: Storage | undefined

export function getStorage(): Storage {
  if (instance) return instance
  const s = config.storage
  if (s.driver === 'memory') {
    if (config.env === 'production') throw new HttpError(503, 'Media storage is misconfigured')
    return (instance = new MemoryStorage())
  }
  if (s.driver === 'disk') {
    if (config.env === 'production') throw new HttpError(503, 'Media storage is misconfigured')
    return (instance = new DiskStorage(s.diskDir ?? './.media', s.publicUrl ?? 'http://localhost:9100'))
  }
  if (!s.accountId || !s.accessKeyId || !s.secretAccessKey || !s.bucket || !s.publicUrl) {
    // Never pretend an upload worked when storage is not configured.
    throw new HttpError(503, 'Media storage (Cloudflare R2) is not configured')
  }
  return (instance = new R2Storage(s.bucket, s.publicUrl, s.accountId, s.accessKeyId, s.secretAccessKey))
}

/** Test hook. */
export function __setStorage(s: Storage | undefined) {
  instance = s
}
