import { createHash, randomBytes } from 'node:crypto'
import { config } from '../config.js'

export const hashIp = (ip: string | undefined) =>
  createHash('sha256')
    .update(config.ipHashSalt + (ip ?? 'unknown'))
    .digest('hex')

export function temporaryPassword(): string {
  // 16 chars, url-safe, no ambiguous look-alikes issue for copy/paste
  return randomBytes(12).toString('base64url')
}
