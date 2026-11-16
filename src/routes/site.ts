// Hero slides (home carousel) and the Facebook page feed.
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { audit } from '../lib/audit.js'
import { fetchLatestPosts, clearFeedCache, type FacebookConfig } from '../lib/facebook.js'
import { notFound, unprocessable } from '../lib/errors.js'
import { idParam } from '../lib/http.js'
import { triggerRebuild } from '../lib/rebuild.js'
import { mediaRef } from '../lib/serialize.js'
import { authenticate, requirePermission } from '../middleware/auth.js'
import type { Prisma } from '../generated/prisma/client.js'

const slideInclude = { category: { select: { id: true, slug: true, name: true, status: true } }, image: true }
type Slide = Prisma.HeroSlideGetPayload<{ include: typeof slideInclude }>

const slideDto = (s: Slide) => ({
  id: s.id,
  eyebrow: s.eyebrow,
  title: s.title,
  subtitle: s.subtitle,
  ctaLabel: s.ctaLabel,
  quoteLabel: s.quoteLabel,
  categoryId: s.categoryId,
  category: s.category ? { id: s.category.id, slug: s.category.slug, name: s.category.name } : null,
  linkUrl: s.linkUrl,
  image: mediaRef(s.image, s.imageAlt),
  imageAlt: s.imageAlt,
  sortOrder: s.sortOrder,
  active: s.active,
})

// ---------------- public ----------------
export const siteRouter = Router()

siteRouter.get('/hero-slides', async (_req, res) => {
  const rows = await prisma.heroSlide.findMany({
    where: { active: true, OR: [{ categoryId: null }, { category: { status: 'PUBLISHED' } }] },
    include: slideInclude,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.json(rows.map(slideDto))
})

async function loadFacebook(): Promise<FacebookConfig | null> {
  const row = await prisma.section.findUnique({ where: { slug: 'integration-facebook' } })
  const d = row?.data as Partial<FacebookConfig> | undefined
  if (!d?.pageId || !d.accessToken) return null
  return { pageId: d.pageId, pageUrl: d.pageUrl ?? '', pageName: d.pageName ?? '', accessToken: d.accessToken }
}

siteRouter.get('/social/facebook', async (_req, res) => {
  const cfg = await loadFacebook()
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  if (!cfg) return res.json({ configured: false, pageUrl: '', pageName: '', posts: [] })
  const { posts, stale } = await fetchLatestPosts(cfg)
  res.json({ configured: true, pageUrl: cfg.pageUrl, pageName: cfg.pageName, stale, posts })
})

// ---------------- admin ----------------
export const siteAdminRouter = Router()
siteAdminRouter.use(authenticate)

const slideBody = z.object({
  eyebrow: z.string().trim().max(80).optional(),
  title: z.string().trim().min(2).max(140),
  subtitle: z.string().trim().max(400).optional(),
  ctaLabel: z.string().trim().min(1).max(40).optional(),
  quoteLabel: z.string().trim().min(1).max(40).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  linkUrl: z.string().trim().max(300).optional(),
  imageId: z.number().int().positive().nullable().optional(),
  imageAlt: z.string().trim().max(200).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
})

async function checkRefs(b: z.infer<typeof slideBody>) {
  if (b.categoryId && !(await prisma.category.findUnique({ where: { id: b.categoryId } }))) throw unprocessable('Category not found')
  if (b.imageId && !(await prisma.media.findUnique({ where: { id: b.imageId } }))) throw unprocessable('Image not found')
}

siteAdminRouter.get('/hero-slides', requirePermission('sections:write'), async (_req, res) => {
  const rows = await prisma.heroSlide.findMany({ include: slideInclude, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  res.json(rows.map(slideDto))
})

siteAdminRouter.post('/hero-slides', requirePermission('sections:write'), async (req, res) => {
  const b = slideBody.parse(req.body)
  await checkRefs(b)
  const created = await prisma.heroSlide.create({ data: b, include: slideInclude })
  await audit(req.user!.id, 'hero.create', 'HeroSlide', created.id)
  res.status(201).json({ ...slideDto(created), rebuild: await triggerRebuild('hero') })
})

siteAdminRouter.put('/hero-slides/:id', requirePermission('sections:write'), async (req, res) => {
  const id = idParam(req)
  const b = slideBody.partial().parse(req.body)
  if (!(await prisma.heroSlide.findUnique({ where: { id } }))) throw notFound()
  await checkRefs(b as z.infer<typeof slideBody>)
  const updated = await prisma.heroSlide.update({ where: { id }, data: b, include: slideInclude })
  await audit(req.user!.id, 'hero.update', 'HeroSlide', id)
  res.json({ ...slideDto(updated), rebuild: await triggerRebuild('hero') })
})

siteAdminRouter.delete('/hero-slides/:id', requirePermission('sections:write'), async (req, res) => {
  const id = idParam(req)
  if (!(await prisma.heroSlide.findUnique({ where: { id } }))) throw notFound()
  await prisma.heroSlide.delete({ where: { id } })
  await audit(req.user!.id, 'hero.delete', 'HeroSlide', id)
  res.json({ success: true, rebuild: await triggerRebuild('hero') })
})

const fbBody = z.object({
  pageId: z.string().trim().regex(/^\d{5,30}$/, 'Page ID is the numeric ID of the Facebook Page'),
  pageUrl: z.string().trim().url().max(300),
  pageName: z.string().trim().max(120).optional(),
  /** Omit or send empty to keep the stored token. */
  accessToken: z.string().trim().max(1000).optional(),
})

siteAdminRouter.get('/integrations/facebook', requirePermission('sections:write'), async (_req, res) => {
  const cfg = await loadFacebook()
  const row = await prisma.section.findUnique({ where: { slug: 'integration-facebook' } })
  const d = (row?.data ?? {}) as Partial<FacebookConfig>
  res.json({ pageId: d.pageId ?? '', pageUrl: d.pageUrl ?? '', pageName: d.pageName ?? '', hasToken: !!cfg?.accessToken || !!d.accessToken })
})

siteAdminRouter.put('/integrations/facebook', requirePermission('sections:write'), async (req, res) => {
  const b = fbBody.parse(req.body)
  const row = await prisma.section.findUnique({ where: { slug: 'integration-facebook' } })
  const old = (row?.data ?? {}) as Partial<FacebookConfig>
  const accessToken = b.accessToken || old.accessToken || ''
  if (!accessToken) throw unprocessable('An access token is required the first time')
  const data = { pageId: b.pageId, pageUrl: b.pageUrl, pageName: b.pageName ?? '', accessToken }
  await prisma.section.upsert({ where: { slug: 'integration-facebook' }, create: { slug: 'integration-facebook', data }, update: { data } })
  clearFeedCache()
  await audit(req.user!.id, 'integration.facebook.update', 'Section', 'integration-facebook')
  res.json({ success: true, pageId: data.pageId, pageUrl: data.pageUrl, pageName: data.pageName, hasToken: true })
})

siteAdminRouter.delete('/integrations/facebook', requirePermission('sections:write'), async (req, res) => {
  await prisma.section.deleteMany({ where: { slug: 'integration-facebook' } })
  clearFeedCache()
  await audit(req.user!.id, 'integration.facebook.remove', 'Section', 'integration-facebook')
  res.json({ success: true })
})

/** Lets the admin check the connection without waiting for the cache. */
siteAdminRouter.post('/integrations/facebook/test', requirePermission('sections:write'), async (_req, res) => {
  const cfg = await loadFacebook()
  if (!cfg) throw unprocessable('Facebook is not configured')
  clearFeedCache()
  const { posts, stale } = await fetchLatestPosts(cfg)
  res.json({ ok: !stale, count: posts.length, posts })
})
