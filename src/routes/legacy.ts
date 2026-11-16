// Routes whose paths, methods and response shapes match the Laravel API the existing client already uses.
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../db.js'
import { audit } from '../lib/audit.js'
import { conflict, notFound, unprocessable, HttpError } from '../lib/errors.js'
import { idParam, strParam } from '../lib/http.js'
import { MAX_UPLOAD_BYTES, storeImage } from '../lib/images.js'
import { triggerRebuild } from '../lib/rebuild.js'
import { mediaDto } from '../lib/serialize.js'
import { getStorage } from '../lib/storage.js'
import { authenticate, requirePermission } from '../middleware/auth.js'
import { can } from '../lib/permissions.js'

export const VALID_SLUGS = ['settings', 'hero', 'equipment-grid', 'stats', 'showcase', 'projects', 'delivery', 'footer', 'tracking'] as const
const MAX_SECTION_BYTES = 204_800
const HEX = /^#[0-9a-fA-F]{3,8}$/

/** Public tag IDs only (these are visible in any page's source). Secrets never belong in this section. */
const trackingSchema = z.object({
  gtmId: z.string().trim().regex(/^(GTM-[A-Z0-9]{4,10})?$/, 'Google Tag Manager ID looks like GTM-XXXXXXX').default(''),
  ga4Id: z.string().trim().regex(/^(G-[A-Z0-9]{6,14})?$/, 'Google Analytics 4 ID looks like G-XXXXXXXXXX').default(''),
  metaPixelId: z.string().trim().regex(/^(\d{10,18})?$/, 'Meta Pixel ID is 10-18 digits').default(''),
  googleAdsId: z.string().trim().regex(/^(AW-\d{6,12})?$/, 'Google Ads ID looks like AW-123456789').default(''),
  googleAdsLeadLabel: z.string().trim().regex(/^([A-Za-z0-9_-]{6,40})?$/, 'Conversion label has letters, digits, - and _ only').default(''),
  clarityId: z.string().trim().regex(/^([a-z0-9]{6,14})?$/, 'Clarity project ID is lowercase letters and digits').default(''),
  googleSiteVerification: z.string().trim().regex(/^([A-Za-z0-9_-]{20,80})?$/, 'Paste only the code from content="…", not the whole tag').default(''),
  bingSiteVerification: z.string().trim().regex(/^([A-Za-z0-9]{16,64})?$/, 'Paste only the code from content="…", not the whole tag').default(''),
  facebookDomainVerification: z.string().trim().regex(/^([a-z0-9]{20,40})?$/, 'Paste only the code from content="…", not the whole tag').default(''),
  requireConsent: z.boolean().default(true),
}).strict()

export const sectionsRouter = Router()

sectionsRouter.get('/', async (_req, res) => {
  const rows = await prisma.section.findMany({ where: { slug: { in: [...VALID_SLUGS] } } })
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  res.json(rows.map((s) => ({ slug: s.slug, data: s.data })))
})

sectionsRouter.get('/:slug', async (req, res) => {
  const slug = strParam(req, 'slug')
  if (!(VALID_SLUGS as readonly string[]).includes(slug)) throw new HttpError(400, 'Invalid section')
  const row = await prisma.section.findUnique({ where: { slug } })
  if (!row) throw notFound('Section not found')
  res.json(row.data)
})

sectionsRouter.post('/:slug', authenticate, requirePermission('sections:write'), async (req, res) => {
  const slug = strParam(req, 'slug')
  if (!(VALID_SLUGS as readonly string[]).includes(slug)) throw new HttpError(400, 'Invalid section')
  const body: unknown = req.body
  // Never wipe existing content because of a malformed payload.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw unprocessable('Invalid JSON payload')
  if (JSON.stringify(body).length > MAX_SECTION_BYTES) throw new HttpError(413, 'Payload too large')
  let data: object = body as object
  if (slug === 'tracking') {
    const parsed = trackingSchema.safeParse(body)
    if (!parsed.success) throw unprocessable(parsed.error.issues[0]?.message ?? 'Invalid tracking settings')
    data = parsed.data
  }
  const row = await prisma.section.upsert({
    where: { slug },
    create: { slug, data },
    update: { data },
  })
  await audit(req.user!.id, 'section.update', 'Section', slug)
  const rebuild = await triggerRebuild(`section:${slug}`)
  res.json({ success: true, section: row.data, rebuild })
})

export const themeRouter = Router()

themeRouter.get('/', async (_req, res) => {
  const row = await prisma.siteTheme.findFirst({ orderBy: { id: 'asc' } })
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  res.json(row?.data ?? {})
})

themeRouter.post('/', authenticate, requirePermission('sections:write'), async (req, res) => {
  const body: unknown = req.body
  if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length === 0) {
    throw unprocessable('Invalid payload')
  }
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== 'string' || !HEX.test(v)) throw unprocessable(`Invalid theme value for '${k}' — hex color expected`)
  }
  const existing = await prisma.siteTheme.findFirst({ orderBy: { id: 'asc' } })
  const row = existing
    ? await prisma.siteTheme.update({ where: { id: existing.id }, data: { data: body as object } })
    : await prisma.siteTheme.create({ data: { data: body as object } })
  await audit(req.user!.id, 'theme.update', 'SiteTheme', row.id)
  const rebuild = await triggerRebuild('theme')
  res.json({ success: true, theme: row.data, rebuild })
})

// ---------- Media ----------
export const mediaRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 10 },
})

mediaRouter.use(authenticate)

mediaRouter.get('/', async (_req, res) => {
  const rows = await prisma.media.findMany({ orderBy: { id: 'desc' } })
  res.json(rows.map(mediaDto))
})

mediaRouter.post(
  '/',
  requirePermission('media:upload'),
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 10 },
    { name: 'files[]', maxCount: 10 }, // PHP-style field name used by the existing admin media page
  ]),
  async (req, res) => {
    const fields = (req.files ?? {}) as Record<string, Express.Multer.File[]>
    const single = fields.file?.[0]
    const files = single ? [single] : [...(fields.files ?? []), ...(fields['files[]'] ?? [])]
    if (files.length === 0) throw unprocessable('No files uploaded')

    const storage = getStorage()
    const created = []
    const errors: { filename: string; error: string }[] = []
    for (const f of files) {
      try {
        const img = await storeImage(storage, { buffer: f.buffer, originalname: f.originalname })
        const row = await prisma.media.create({
          data: {
            filename: img.filename,
            key: img.key,
            url: img.url,
            mimeType: img.mimeType,
            size: img.size,
            width: img.width,
            height: img.height,
            variants: img.variants,
            uploadedById: req.user!.id,
          },
        })
        created.push(mediaDto(row))
      } catch (err) {
        errors.push({ filename: f.originalname, error: err instanceof HttpError ? err.message : 'Upload failed' })
        if (!(err instanceof HttpError)) console.error('[media] upload failed', (err as Error).message)
      }
    }
    if (created.length === 0) {
      res.status(422).json({ errors })
      return
    }
    if (created.length === 1 && errors.length === 0 && single) {
      res.status(201).json(created[0])
      return
    }
    res.status(201).json({ media: created, errors })
  },
)

mediaRouter.patch('/:id', requirePermission('media:upload'), async (req, res) => {
  const id = idParam(req)
  const { alt } = z.object({ alt: z.string().max(300) }).parse(req.body)
  const row = await prisma.media.update({ where: { id }, data: { alt } })
  res.json(mediaDto(row))
})

mediaRouter.delete('/:id', async (req, res) => {
  const id = idParam(req)
  const user = req.user!
  if (user.mustChangePassword) throw new HttpError(403, 'Password change required', { code: 'PASSWORD_CHANGE_REQUIRED' })
  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) throw notFound()
  const own = media.uploadedById === user.id
  if (!(can(user.role, 'media:delete-any') || (own && can(user.role, 'media:delete-own')))) {
    throw new HttpError(403, 'You can only delete media you uploaded')
  }

  const [products, categories, posts, sections] = await Promise.all([
    prisma.productImage.count({ where: { mediaId: id } }),
    prisma.category.count({ where: { imageId: id } }),
    prisma.post.count({ where: { coverImageId: id } }),
    prisma.section.findMany(),
  ])
  const inSections = sections.filter((s) => JSON.stringify(s.data).includes(media.url)).map((s) => s.slug)
  if (products || categories || posts || inSections.length) {
    throw conflict('Media is in use and cannot be deleted', { usedBy: { products, categories, posts, sections: inSections } })
  }

  const storage = getStorage()
  const keys = [media.key, ...((media.variants as { key: string }[] | null) ?? []).map((v) => v.key)]
  await Promise.all(keys.map((k) => storage.remove(k)))
  await prisma.media.delete({ where: { id } })
  await audit(user.id, 'media.delete', 'Media', id, { filename: media.filename })
  res.json({ success: true })
})
