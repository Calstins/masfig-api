import { createHash } from 'node:crypto'
import express, { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { hashIp } from '../lib/hash.js'
import { requirePermission } from '../middleware/auth.js'

/**
 * First-party site statistics. Cookie-free and anonymous: no IP address or user agent is stored, and the visitor value is
 * a hash that changes every day. Counts page views, WhatsApp / call / email clicks and product views; quote requests come
 * straight from the Enquiry table so they are exact even when a visitor blocks scripts.
 */
const TYPES = ['pageview', 'whatsapp_click', 'call_click', 'email_click', 'product_view'] as const
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|preview|facebookexternalhit|whatsapp|telegram|discord|embedly/i
const TZ = 'Africa/Lagos'

const eventSchema = z.object({
  type: z.enum(TYPES),
  path: z.string().trim().min(1).max(300),
  label: z.string().trim().max(120).optional(),
  ref: z.string().trim().max(300).optional(),
  utm: z.string().trim().max(60).optional(),
})

function device(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

function cleanPath(p: string): string {
  const noQuery = p.split(/[?#]/)[0] || '/'
  const withSlash = noQuery.startsWith('/') ? noQuery : `/${noQuery}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') || '/' : withSlash
}

function refHost(ref: string | undefined): string | null {
  if (!ref) return null
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase()
    const own = new URL(config.publicSiteUrl).hostname.replace(/^www\./, '').toLowerCase()
    return h && h !== own ? h.slice(0, 80) : null
  } catch {
    return null
  }
}

// A small per-instance limiter so one connection cannot flood the table. Serverless instances are short-lived, so this is a soft guard.
const buckets = new Map<string, { n: number; reset: number }>()
function allowed(key: string): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    if (buckets.size > 5000) buckets.clear()
    buckets.set(key, { n: 1, reset: now + 60_000 })
    return true
  }
  return ++b.n <= 90
}

export const trackRouter = Router()

// text/plain body (sent as a "simple" request by the browser) so no CORS preflight is needed for each event.
trackRouter.post('/', express.text({ type: '*/*', limit: '4kb' }), async (req, res) => {
  const ua = String(req.headers['user-agent'] ?? '')
  if (!ua || BOT.test(ua)) return void res.status(204).end()
  let parsed: z.infer<typeof eventSchema>
  try {
    parsed = eventSchema.parse(typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
  } catch {
    throw new HttpError(400, 'Bad event')
  }
  const ipHash = hashIp(req.ip)
  if (!allowed(ipHash)) return void res.status(204).end()
  const day = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const visitor = createHash('sha256').update(`${config.ipHashSalt}|${req.ip}|${ua}|${day}`).digest('hex').slice(0, 16)
  const source = parsed.utm ? parsed.utm.toLowerCase() : (refHost(parsed.ref) ?? 'direct')
  await prisma.siteEvent.create({
    data: { type: parsed.type, path: cleanPath(parsed.path), label: parsed.label || null, source, device: device(ua), visitor },
  })
  // Housekeeping: keep about 13 months of raw events.
  if (Math.random() < 0.002) void prisma.siteEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 400 * 86_400_000) } } }).catch(() => {})
  res.status(204).end()
})

export const analyticsAdminRouter = Router()
analyticsAdminRouter.use(requirePermission('sections:write'))

type Row = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)

async function totalsFor(from: Date, to: Date) {
  const [ev, quotes] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT "type", COUNT(*) AS n, COUNT(DISTINCT "visitor") AS v
      FROM "SiteEvent" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY "type"`,
    prisma.enquiry.count({ where: { createdAt: { gte: from, lt: to } } }),
  ])
  const by = new Map(ev.map((r) => [String(r.type), r]))
  const n = (t: string) => num(by.get(t)?.n)
  return {
    pageviews: n('pageview'),
    visitors: num(by.get('pageview')?.v),
    whatsapp: n('whatsapp_click'),
    calls: n('call_click'),
    emails: n('email_click'),
    productViews: n('product_view'),
    quotes,
  }
}

analyticsAdminRouter.get('/', async (req, res) => {
  const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30
  const now = new Date()
  const from = new Date(now.getTime() - days * 86_400_000)
  const prevFrom = new Date(from.getTime() - days * 86_400_000)

  const [totals, previous, daily, quotesDaily, pages, products, whatsapp, calls, sources, devices] = await Promise.all([
    totalsFor(from, now),
    totalsFor(prevFrom, from),
    prisma.$queryRaw<Row[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d, "type",
             COUNT(*) AS n, COUNT(DISTINCT "visitor") AS v
      FROM "SiteEvent" WHERE "createdAt" >= ${from} GROUP BY 1, 2`,
    prisma.$queryRaw<Row[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d, COUNT(*) AS n
      FROM "Enquiry" WHERE "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`
      SELECT "path" AS k, COUNT(*) AS n, COUNT(DISTINCT "visitor") AS v FROM "SiteEvent"
      WHERE "type" = 'pageview' AND "createdAt" >= ${from} GROUP BY 1 ORDER BY n DESC LIMIT 10`,
    prisma.$queryRaw<Row[]>`
      SELECT "label" AS k, COUNT(*) AS n FROM "SiteEvent"
      WHERE "type" = 'product_view' AND "label" IS NOT NULL AND "createdAt" >= ${from} GROUP BY 1 ORDER BY n DESC LIMIT 10`,
    prisma.$queryRaw<Row[]>`
      SELECT COALESCE("label", 'page') AS k, COUNT(*) AS n FROM "SiteEvent"
      WHERE "type" = 'whatsapp_click' AND "createdAt" >= ${from} GROUP BY 1 ORDER BY n DESC LIMIT 8`,
    prisma.$queryRaw<Row[]>`
      SELECT COALESCE("label", 'page') AS k, COUNT(*) AS n FROM "SiteEvent"
      WHERE "type" = 'call_click' AND "createdAt" >= ${from} GROUP BY 1 ORDER BY n DESC LIMIT 8`,
    prisma.$queryRaw<Row[]>`
      SELECT COALESCE("source", 'direct') AS k, COUNT(*) AS n FROM "SiteEvent"
      WHERE "type" = 'pageview' AND "createdAt" >= ${from} GROUP BY 1 ORDER BY n DESC LIMIT 8`,
    prisma.$queryRaw<Row[]>`
      SELECT COALESCE("device", 'desktop') AS k, COUNT(*) AS n FROM "SiteEvent"
      WHERE "type" = 'pageview' AND "createdAt" >= ${from} GROUP BY 1 ORDER BY n DESC`,
  ])

  // One entry per day (Lagos time), zeros included, so the chart has no gaps.
  const series = new Map<string, { date: string; pageviews: number; visitors: number; whatsapp: number; calls: number; quotes: number }>()
  const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ })
  for (let i = days - 1; i >= 0; i--) {
    const d = dayKey(now.getTime() - i * 86_400_000)
    series.set(d, { date: d, pageviews: 0, visitors: 0, whatsapp: 0, calls: 0, quotes: 0 })
  }
  for (const r of daily) {
    const s = series.get(String(r.d))
    if (!s) continue
    if (r.type === 'pageview') { s.pageviews = num(r.n); s.visitors = num(r.v) }
    if (r.type === 'whatsapp_click') s.whatsapp = num(r.n)
    if (r.type === 'call_click') s.calls = num(r.n)
  }
  for (const r of quotesDaily) { const s = series.get(String(r.d)); if (s) s.quotes = num(r.n) }

  const list = (rows: Row[]) => rows.map((r) => ({ label: String(r.k), count: num(r.n), visitors: r.v === undefined ? undefined : num(r.v) }))
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    days,
    from: from.toISOString(),
    totals,
    previous,
    daily: [...series.values()],
    topPages: list(pages),
    topProducts: list(products),
    whatsappBy: list(whatsapp),
    callsBy: list(calls),
    sources: list(sources),
    devices: list(devices),
  })
})
