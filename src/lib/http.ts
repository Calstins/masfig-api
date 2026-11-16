import type { Request } from 'express'
import { notFound } from './errors.js'

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name])
  if (!Number.isInteger(n) || n < 1) throw notFound()
  return n
}

export const strParam = (req: Request, name: string) => String(req.params[name] ?? '')

export function pageParams(req: Request, defaultLimit = 50, maxLimit = 200) {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit, 1), maxLimit)
  const offset = Math.max(parseInt(String(req.query.offset ?? 0), 10) || 0, 0)
  return { limit, offset }
}
