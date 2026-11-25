import type { RequestHandler } from 'express'

/**
 * A short in-memory cache for the three public read endpoints the site build calls. The build (and `next dev`) asks
 * for the whole catalogue many times; this keeps repeated calls from each running the full set of database queries.
 * Any successful write clears it, and requests carrying a login header always bypass it.
 */
const TTL_MS = 20_000
const entries = new Map<string, { at: number; body: string }>()

export function clearResponseCache() { entries.clear() }

export function responseCache(paths: string[]): RequestHandler {
  const watched = new Set(paths)
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next()
    if (req.method !== 'GET') {
      if (req.path.startsWith('/track')) return next() // visitor statistics never change the catalogue
      res.on('finish', () => { if (res.statusCode < 400) clearResponseCache() })
      return next()
    }
    if (!watched.has(req.path) || req.headers.authorization) return next()
    const hit = entries.get(req.path)
    if (hit && Date.now() - hit.at < TTL_MS) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('X-Cache', 'HIT')
      return void res.send(hit.body)
    }
    const json = res.json.bind(res)
    res.json = (body: unknown) => {
      if (res.statusCode === 200) entries.set(req.path, { at: Date.now(), body: JSON.stringify(body) })
      return json(body)
    }
    next()
  }
}
