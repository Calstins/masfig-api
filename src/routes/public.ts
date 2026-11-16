import { Router } from 'express'
import { prisma } from '../db.js'
import { notFound } from '../lib/errors.js'
import { pageParams, strParam } from '../lib/http.js'
import { categoryDto, postDto, productDto } from '../lib/serialize.js'

export const publicRouter = Router()

/** Site-wide price display switch, stored in the public `settings` section. Off unless explicitly turned on. */
export async function getShowPrices(): Promise<boolean> {
  const row = await prisma.section.findUnique({ where: { slug: 'settings' } })
  return (row?.data as { showPrices?: unknown } | null)?.showPrices === true
}

publicRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  next()
})

const productInclude = { category: true, images: { include: { media: true } }, faqs: { where: { scope: 'PRODUCT' as const } } }
const categoryInclude = {
  image: true,
  faqs: { where: { scope: 'CATEGORY' as const } },
  _count: { select: { products: { where: { status: 'PUBLISHED' as const } } } },
}
const postInclude = { coverImage: true, author: { select: { id: true, name: true } }, category: true, products: { where: { status: 'PUBLISHED' as const, category: { status: 'PUBLISHED' as const } } } }
const liveProduct = { status: 'PUBLISHED' as const, category: { status: 'PUBLISHED' as const } }

publicRouter.get('/categories', async (_req, res) => {
  const rows = await prisma.category.findMany({ where: { status: 'PUBLISHED' }, include: categoryInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  res.json(rows.map((c) => categoryDto(c)))
})

publicRouter.get('/categories/:slug', async (req, res) => {
  const showPrices = await getShowPrices()
  const c = await prisma.category.findFirst({ where: { slug: strParam(req, 'slug'), status: 'PUBLISHED' }, include: categoryInclude })
  if (!c) throw notFound()
  const products = await prisma.product.findMany({ where: { categoryId: c.id, status: 'PUBLISHED' }, include: productInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  res.json({ ...categoryDto(c), products: products.map((p) => productDto(p, false, showPrices)) })
})

publicRouter.get('/products', async (req, res) => {
  const showPrices = await getShowPrices()
  const { limit, offset } = pageParams(req, 50, 200)
  const category = typeof req.query.category === 'string' ? req.query.category : undefined
  const where = { ...liveProduct, ...(category ? { category: { status: 'PUBLISHED' as const, slug: category } } : {}) }
  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, include: productInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: limit, skip: offset }),
    prisma.product.count({ where }),
  ])
  res.json({ items: items.map((p) => productDto(p, false, showPrices)), total })
})

publicRouter.get('/products/:slug', async (req, res) => {
  const showPrices = await getShowPrices()
  const p = await prisma.product.findFirst({ where: { slug: strParam(req, 'slug'), ...liveProduct }, include: productInclude })
  if (!p) throw notFound()
  res.json(productDto(p, false, showPrices))
})

publicRouter.get('/posts', async (req, res) => {
  const { limit, offset } = pageParams(req, 20, 100)
  const where: Record<string, unknown> = { status: 'PUBLISHED' }
  if (typeof req.query.tag === 'string') where.tags = { has: req.query.tag.toLowerCase() }
  const [items, total] = await Promise.all([
    prisma.post.findMany({ where, include: postInclude, orderBy: { publishedAt: 'desc' }, take: limit, skip: offset }),
    prisma.post.count({ where }),
  ])
  res.json({ items: items.map((p) => postDto(p)), total })
})

publicRouter.get('/posts/:slug', async (req, res) => {
  const p = await prisma.post.findFirst({ where: { slug: strParam(req, 'slug'), status: 'PUBLISHED' }, include: postInclude })
  if (!p) throw notFound()
  res.json(postDto(p))
})

/** Everything the static build needs, in one request. Published content only. */
publicRouter.get('/catalog', async (_req, res) => {
  const showPrices = await getShowPrices()
  const [categories, products, posts] = await Promise.all([
    prisma.category.findMany({ where: { status: 'PUBLISHED' }, include: categoryInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.product.findMany({ where: liveProduct, include: productInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.post.findMany({ where: { status: 'PUBLISHED' }, include: postInclude, orderBy: { publishedAt: 'desc' } }),
  ])
  res.json({
    generatedAt: new Date().toISOString(),
    showPrices,
    categories: categories.map((c) => categoryDto(c)),
    products: products.map((p) => productDto(p, false, showPrices)),
    posts: posts.map((p) => postDto(p)),
  })
})
