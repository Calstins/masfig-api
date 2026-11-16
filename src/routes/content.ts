import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import type { Prisma } from '../generated/prisma/client.js'
import { audit } from '../lib/audit.js'
import { categoryGate, postGate, productGate } from '../lib/gates.js'
import { conflict, notFound, unprocessable } from '../lib/errors.js'
import { idParam, pageParams } from '../lib/http.js'
import { triggerRebuild } from '../lib/rebuild.js'
import { categoryDto, postDto, productDto } from '../lib/serialize.js'
import { SLUG_RE, slugify } from '../lib/slug.js'
import { requirePermission } from '../middleware/auth.js'

export const contentRouter = Router()


const productInclude = { category: true, images: { include: { media: true } }, faqs: { where: { scope: 'PRODUCT' as const } } }
const categoryInclude = { image: true, faqs: { where: { scope: 'CATEGORY' as const } }, _count: { select: { products: true } } }
const postInclude = { coverImage: true, author: { select: { id: true, name: true } }, category: true, products: true }

// ---------- shared input pieces ----------
const text = (max: number) => z.string().trim().max(max)
const faqInput = z.array(z.object({ question: z.string().trim().min(3).max(300), answer: z.string().trim().min(3).max(3000) })).max(30)
const slugInput = z.string().trim().toLowerCase().max(80).regex(SLUG_RE, 'Slug may only contain lowercase letters, numbers and hyphens')

function resolveSlug(provided: string | undefined, fallback: string): string {
  const slug = provided ?? slugify(fallback)
  if (!SLUG_RE.test(slug)) throw unprocessable('Could not derive a valid slug; provide one')
  return slug
}

// =====================================================================
// Categories
// =====================================================================
const categoryBase = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugInput.optional(),
  h1: text(160).optional(),
  intro: text(10000).optional(),
  seoTitle: text(120).optional(),
  seoDescription: text(300).optional(),
  imageId: z.number().int().positive().nullable().optional(),
  imageAlt: text(200).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  faqs: faqInput.optional(),
})

const catGate = (c: Prisma.CategoryGetPayload<{ include: typeof categoryInclude }>) =>
  categoryGate({ name: c.name, slug: c.slug, intro: c.intro, seoTitle: c.seoTitle, seoDescription: c.seoDescription, hasImage: !!c.image, imageAlt: c.imageAlt })

contentRouter.get('/categories', requirePermission('content:write'), async (_req, res) => {
  const rows = await prisma.category.findMany({ include: categoryInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  res.json(rows.map((c) => categoryDto(c, true)))
})

contentRouter.get('/categories/:id', requirePermission('content:write'), async (req, res) => {
  const c = await prisma.category.findUnique({ where: { id: idParam(req) }, include: categoryInclude })
  if (!c) throw notFound()
  res.json({ ...categoryDto(c, true), missingForPublish: catGate(c) })
})

contentRouter.post('/categories', requirePermission('content:write'), async (req, res) => {
  const { faqs, slug, ...data } = categoryBase.parse(req.body)
  const created = await prisma.category.create({
    data: {
      ...data,
      slug: resolveSlug(slug, data.name),
      faqs: { create: (faqs ?? []).map((f, i) => ({ scope: 'CATEGORY', question: f.question, answer: f.answer, sortOrder: i })) },
    },
    include: categoryInclude,
  })
  await audit(req.user!.id, 'category.create', 'Category', created.id)
  res.status(201).json({ ...categoryDto(created, true), missingForPublish: catGate(created) })
})

contentRouter.put('/categories/:id', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const { faqs, slug, ...data } = categoryBase.partial().parse(req.body)
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) throw notFound()
  if (slug && slug !== existing.slug && existing.status === 'PUBLISHED') {
    throw conflict('The slug of a published category cannot be changed. Unpublish it first.')
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (faqs) {
      await tx.faq.deleteMany({ where: { categoryId: id, scope: 'CATEGORY' } })
      await tx.faq.createMany({ data: faqs.map((f, i) => ({ scope: 'CATEGORY' as const, categoryId: id, question: f.question, answer: f.answer, sortOrder: i })) })
    }
    const c = await tx.category.update({ where: { id }, data: { ...data, ...(slug ? { slug } : {}) }, include: categoryInclude })
    if (c.status === 'PUBLISHED') {
      const missing = catGate(c)
      if (missing.length) throw unprocessable('A published category must keep meeting the publishing requirements', { missing })
    }
    return c
  })
  await audit(req.user!.id, 'category.update', 'Category', id)
  const rebuild = updated.status === 'PUBLISHED' ? await triggerRebuild(`category:${id}`) : undefined
  res.json({ ...categoryDto(updated, true), missingForPublish: catGate(updated), rebuild })
})

contentRouter.post('/categories/:id/publish', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const c = await prisma.category.findUnique({ where: { id }, include: categoryInclude })
  if (!c) throw notFound()
  const missing = catGate(c)
  if (missing.length) throw unprocessable('Cannot publish', { missing })
  const updated = await prisma.category.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: c.publishedAt ?? new Date() }, include: categoryInclude })
  await audit(req.user!.id, 'category.publish', 'Category', id)
  res.json({ ...categoryDto(updated, true), rebuild: await triggerRebuild(`category:${id}`) })
})

contentRouter.post('/categories/:id/unpublish', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const live = await prisma.product.count({ where: { categoryId: id, status: 'PUBLISHED' } })
  if (live > 0) throw conflict('Unpublish or move this category\'s published products first', { publishedProducts: live })
  const updated = await prisma.category.update({ where: { id }, data: { status: 'DRAFT' }, include: categoryInclude }).catch(() => null)
  if (!updated) throw notFound()
  await audit(req.user!.id, 'category.unpublish', 'Category', id)
  res.json({ ...categoryDto(updated, true), rebuild: await triggerRebuild(`category:${id}`) })
})

contentRouter.delete('/categories/:id', requirePermission('content:delete'), async (req, res) => {
  const id = idParam(req)
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } })
  if (!c) throw notFound()
  if (c._count.products > 0) throw conflict('Delete or move the products in this category first', { products: c._count.products })
  await prisma.category.delete({ where: { id } })
  await audit(req.user!.id, 'category.delete', 'Category', id, { slug: c.slug })
  res.json({ success: true, rebuild: c.status === 'PUBLISHED' ? await triggerRebuild(`category:${id}`) : undefined })
})

// =====================================================================
// Products
// =====================================================================
const productBase = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugInput.optional(),
  brand: text(100).optional(),
  model: text(100).optional(),
  categoryId: z.number().int().positive(),
  summary: text(300).optional(),
  description: text(20000).optional(),
  specs: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(300) })).max(60).optional(),
  dimensions: text(200).optional(),
  capacity: text(200).optional(),
  power: text(200).optional(),
  applications: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  availability: z.enum(['IN_STOCK', 'ON_REQUEST', 'OUT_OF_STOCK', 'UNKNOWN']).optional(),
  priceMode: z.enum(['QUOTE', 'PRICE']).optional(),
  price: z.number().min(0).max(100_000_000_000).nullable().optional(),
  currency: z.enum(['NGN', 'USD']).optional(),
  warranty: text(300).optional(),
  seoTitle: text(120).optional(),
  seoDescription: text(300).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  images: z.array(z.object({ mediaId: z.number().int().positive(), alt: text(200) })).max(12).optional(),
  faqs: faqInput.optional(),
})

const prodGate = (p: Prisma.ProductGetPayload<{ include: typeof productInclude }>) =>
  productGate({
    name: p.name,
    slug: p.slug,
    description: p.description,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    priceMode: p.priceMode,
    price: p.price == null ? null : Number(p.price),
    images: p.images,
    categoryPublished: p.category.status === 'PUBLISHED',
  })

contentRouter.get('/products', requirePermission('content:write'), async (req, res) => {
  const { limit, offset } = pageParams(req)
  const where: Prisma.ProductWhereInput = {}
  if (req.query.categoryId) where.categoryId = Number(req.query.categoryId)
  if (req.query.status === 'DRAFT' || req.query.status === 'PUBLISHED') where.status = req.query.status
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    where.OR = [
      { name: { contains: req.query.q.trim(), mode: 'insensitive' } },
      { brand: { contains: req.query.q.trim(), mode: 'insensitive' } },
      { model: { contains: req.query.q.trim(), mode: 'insensitive' } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, include: productInclude, orderBy: { updatedAt: 'desc' }, take: limit, skip: offset }),
    prisma.product.count({ where }),
  ])
  res.json({ items: items.map((p) => productDto(p, true)), total })
})

contentRouter.get('/products/:id', requirePermission('content:write'), async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: idParam(req) }, include: productInclude })
  if (!p) throw notFound()
  res.json({ ...productDto(p, true), missingForPublish: prodGate(p) })
})

function priceFields(mode: 'QUOTE' | 'PRICE' | undefined, price: number | null | undefined) {
  if (mode === 'QUOTE') return { priceMode: 'QUOTE' as const, price: null }
  return { ...(mode ? { priceMode: mode } : {}), ...(price !== undefined ? { price } : {}) }
}

contentRouter.post('/products', requirePermission('content:write'), async (req, res) => {
  const { faqs, images, slug, price, priceMode, ...data } = productBase.parse(req.body)
  const created = await prisma.product.create({
    data: {
      ...data,
      ...priceFields(priceMode, price),
      slug: resolveSlug(slug, data.name),
      images: { create: (images ?? []).map((i, idx) => ({ mediaId: i.mediaId, alt: i.alt, sortOrder: idx })) },
      faqs: { create: (faqs ?? []).map((f, i) => ({ scope: 'PRODUCT', question: f.question, answer: f.answer, sortOrder: i })) },
    },
    include: productInclude,
  })
  await audit(req.user!.id, 'product.create', 'Product', created.id)
  res.status(201).json({ ...productDto(created, true), missingForPublish: prodGate(created) })
})

contentRouter.put('/products/:id', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const { faqs, images, slug, price, priceMode, ...data } = productBase.partial().parse(req.body)
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw notFound()
  if (slug && slug !== existing.slug && existing.status === 'PUBLISHED') {
    throw conflict('The slug of a published product cannot be changed. Unpublish it first.')
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (faqs) {
      await tx.faq.deleteMany({ where: { productId: id, scope: 'PRODUCT' } })
      await tx.faq.createMany({ data: faqs.map((f, i) => ({ scope: 'PRODUCT' as const, productId: id, question: f.question, answer: f.answer, sortOrder: i })) })
    }
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: id } })
      await tx.productImage.createMany({ data: images.map((i, idx) => ({ productId: id, mediaId: i.mediaId, alt: i.alt, sortOrder: idx })) })
    }
    const p = await tx.product.update({
      where: { id },
      data: { ...data, ...priceFields(priceMode, price), ...(slug ? { slug } : {}) },
      include: productInclude,
    })
    if (p.status === 'PUBLISHED') {
      const missing = prodGate(p)
      if (missing.length) throw unprocessable('A published product must keep meeting the publishing requirements', { missing })
    }
    return p
  })
  await audit(req.user!.id, 'product.update', 'Product', id)
  const rebuild = updated.status === 'PUBLISHED' ? await triggerRebuild(`product:${id}`) : undefined
  res.json({ ...productDto(updated, true), missingForPublish: prodGate(updated), rebuild })
})

contentRouter.post('/products/:id/publish', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const p = await prisma.product.findUnique({ where: { id }, include: productInclude })
  if (!p) throw notFound()
  const missing = prodGate(p)
  if (missing.length) throw unprocessable('Cannot publish', { missing })
  const updated = await prisma.product.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: p.publishedAt ?? new Date() }, include: productInclude })
  await audit(req.user!.id, 'product.publish', 'Product', id)
  res.json({ ...productDto(updated, true), rebuild: await triggerRebuild(`product:${id}`) })
})

contentRouter.post('/products/:id/unpublish', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const updated = await prisma.product.update({ where: { id }, data: { status: 'DRAFT' }, include: productInclude }).catch(() => null)
  if (!updated) throw notFound()
  await audit(req.user!.id, 'product.unpublish', 'Product', id)
  res.json({ ...productDto(updated, true), rebuild: await triggerRebuild(`product:${id}`) })
})

contentRouter.delete('/products/:id', requirePermission('content:delete'), async (req, res) => {
  const id = idParam(req)
  const p = await prisma.product.findUnique({ where: { id } })
  if (!p) throw notFound()
  await prisma.product.delete({ where: { id } })
  await audit(req.user!.id, 'product.delete', 'Product', id, { slug: p.slug })
  res.json({ success: true, rebuild: p.status === 'PUBLISHED' ? await triggerRebuild(`product:${id}`) : undefined })
})

// =====================================================================
// Posts
// =====================================================================
const postBase = z.object({
  title: z.string().trim().min(3).max(200),
  slug: slugInput.optional(),
  excerpt: text(400).optional(),
  body: z.string().max(100_000).optional(),
  coverImageId: z.number().int().positive().nullable().optional(),
  coverAlt: text(200).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(15).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  productIds: z.array(z.number().int().positive()).max(10).optional(),
  seoTitle: text(120).optional(),
  seoDescription: text(300).optional(),
})

const pGate = (p: Prisma.PostGetPayload<{ include: typeof postInclude }>) =>
  postGate({ title: p.title, slug: p.slug, excerpt: p.excerpt, body: p.body, hasCover: !!p.coverImage, coverAlt: p.coverAlt, seoTitle: p.seoTitle, seoDescription: p.seoDescription })

contentRouter.get('/posts', requirePermission('content:write'), async (req, res) => {
  const { limit, offset } = pageParams(req)
  const where: Prisma.PostWhereInput = {}
  if (req.query.status === 'DRAFT' || req.query.status === 'PUBLISHED') where.status = req.query.status
  if (typeof req.query.q === 'string' && req.query.q.trim()) where.title = { contains: req.query.q.trim(), mode: 'insensitive' }
  const [items, total] = await Promise.all([
    prisma.post.findMany({ where, include: postInclude, orderBy: { updatedAt: 'desc' }, take: limit, skip: offset }),
    prisma.post.count({ where }),
  ])
  res.json({ items: items.map((p) => postDto(p, true)), total })
})

contentRouter.get('/posts/:id', requirePermission('content:write'), async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: idParam(req) }, include: postInclude })
  if (!p) throw notFound()
  res.json({ ...postDto(p, true), missingForPublish: pGate(p) })
})

const uniqueTags = (t?: string[]) => (t ? [...new Set(t)] : undefined)

contentRouter.post('/posts', requirePermission('content:write'), async (req, res) => {
  const { slug, productIds, tags, ...data } = postBase.parse(req.body)
  const created = await prisma.post.create({
    data: {
      ...data,
      tags: uniqueTags(tags) ?? [],
      slug: resolveSlug(slug, data.title),
      authorId: req.user!.id,
      ...(productIds ? { products: { connect: productIds.map((id) => ({ id })) } } : {}),
    },
    include: postInclude,
  })
  await audit(req.user!.id, 'post.create', 'Post', created.id)
  res.status(201).json({ ...postDto(created, true), missingForPublish: pGate(created) })
})

contentRouter.put('/posts/:id', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const { slug, productIds, tags, ...data } = postBase.partial().parse(req.body)
  const existing = await prisma.post.findUnique({ where: { id } })
  if (!existing) throw notFound()
  if (slug && slug !== existing.slug && existing.status === 'PUBLISHED') {
    throw conflict('The slug of a published post cannot be changed. Unpublish it first.')
  }
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.post.update({
      where: { id },
      data: {
        ...data,
        ...(tags ? { tags: uniqueTags(tags) } : {}),
        ...(slug ? { slug } : {}),
        ...(productIds ? { products: { set: productIds.map((pid) => ({ id: pid })) } } : {}),
      },
      include: postInclude,
    })
    if (p.status === 'PUBLISHED') {
      const missing = pGate(p)
      if (missing.length) throw unprocessable('A published post must keep meeting the publishing requirements', { missing })
    }
    return p
  })
  await audit(req.user!.id, 'post.update', 'Post', id)
  const rebuild = updated.status === 'PUBLISHED' ? await triggerRebuild(`post:${id}`) : undefined
  res.json({ ...postDto(updated, true), missingForPublish: pGate(updated), rebuild })
})

contentRouter.post('/posts/:id/publish', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const p = await prisma.post.findUnique({ where: { id }, include: postInclude })
  if (!p) throw notFound()
  const missing = pGate(p)
  if (missing.length) throw unprocessable('Cannot publish', { missing })
  const updated = await prisma.post.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: p.publishedAt ?? new Date() }, include: postInclude })
  await audit(req.user!.id, 'post.publish', 'Post', id)
  res.json({ ...postDto(updated, true), rebuild: await triggerRebuild(`post:${id}`) })
})

contentRouter.post('/posts/:id/unpublish', requirePermission('content:write'), async (req, res) => {
  const id = idParam(req)
  const updated = await prisma.post.update({ where: { id }, data: { status: 'DRAFT' }, include: postInclude }).catch(() => null)
  if (!updated) throw notFound()
  await audit(req.user!.id, 'post.unpublish', 'Post', id)
  res.json({ ...postDto(updated, true), rebuild: await triggerRebuild(`post:${id}`) })
})

contentRouter.delete('/posts/:id', requirePermission('content:delete'), async (req, res) => {
  const id = idParam(req)
  const p = await prisma.post.findUnique({ where: { id } })
  if (!p) throw notFound()
  await prisma.post.delete({ where: { id } })
  await audit(req.user!.id, 'post.delete', 'Post', id, { slug: p.slug })
  res.json({ success: true, rebuild: p.status === 'PUBLISHED' ? await triggerRebuild(`post:${id}`) : undefined })
})
