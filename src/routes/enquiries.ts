import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import type { Prisma } from '../generated/prisma/client.js'
import { audit } from '../lib/audit.js'
import { HttpError, notFound } from '../lib/errors.js'
import { hashIp } from '../lib/hash.js'
import { idParam, pageParams } from '../lib/http.js'
import { notifyEnquiry } from '../lib/notify.js'
import { requirePermission } from '../middleware/auth.js'

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined)

const enquirySchema = z.object({
  kind: z.enum(['QUOTE', 'BULK', 'GENERAL']).default('QUOTE'),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Enter a valid phone number'),
  email: z.string().trim().email().max(200).optional().or(z.literal('')).transform((v) => v || undefined),
  company: opt(150),
  message: z.string().trim().min(5).max(2000),
  quantity: opt(100),
  productId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  pageUrl: opt(500),
  utmSource: opt(100),
  utmMedium: opt(100),
  utmCampaign: opt(150),
  utmContent: opt(150),
  utmTerm: opt(150),
  website: z.string().max(200).optional(), // honeypot: real users never fill this in
})

const MAX_PER_HOUR = 5

export const enquiryPublicRouter = Router()

enquiryPublicRouter.post('/', async (req, res) => {
  const { website, ...input } = enquirySchema.parse(req.body)
  if (website) {
    // Honeypot tripped: bots get a normal-looking reply, nothing is stored or emailed.
    res.status(201).json({ ok: true })
    return
  }
  const ipHash = hashIp(req.ip)
  const recent = await prisma.enquiry.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } })
  if (recent >= MAX_PER_HOUR) {
    res.setHeader('Retry-After', '3600')
    throw new HttpError(429, 'Too many enquiries from this connection. Please call or WhatsApp us instead.')
  }

  let productName: string | undefined
  let categoryId = input.categoryId
  if (input.productId) {
    const p = await prisma.product.findFirst({ where: { id: input.productId, status: 'PUBLISHED' } })
    if (!p) throw new HttpError(422, 'Unknown product')
    productName = p.name
    categoryId ??= p.categoryId
  }
  const created = await prisma.enquiry.create({ data: { ...input, categoryId, productName, ipHash } })
  const emailed = await notifyEnquiry(created)
  res.status(201).json({ ok: true, id: created.id, emailed })
})

export const enquiryAdminRouter = Router()
enquiryAdminRouter.use(requirePermission('enquiries:manage'))

enquiryAdminRouter.get('/', async (req, res) => {
  const { limit, offset } = pageParams(req)
  const where: Prisma.EnquiryWhereInput = {}
  if (req.query.status === 'NEW' || req.query.status === 'HANDLED') where.status = req.query.status
  const [items, total] = await Promise.all([
    prisma.enquiry.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset, omit: { ipHash: true } }),
    prisma.enquiry.count({ where }),
  ])
  res.json({ items, total })
})

enquiryAdminRouter.post('/:id/handled', async (req, res) => {
  const id = idParam(req)
  const { handled } = z.object({ handled: z.boolean() }).parse(req.body)
  const existing = await prisma.enquiry.findUnique({ where: { id } })
  if (!existing) throw notFound()
  const row = await prisma.enquiry.update({
    where: { id },
    data: handled ? { status: 'HANDLED', handledAt: new Date(), handledById: req.user!.id } : { status: 'NEW', handledAt: null, handledById: null },
    omit: { ipHash: true },
  })
  await audit(req.user!.id, handled ? 'enquiry.handled' : 'enquiry.reopen', 'Enquiry', id)
  res.json(row)
})
