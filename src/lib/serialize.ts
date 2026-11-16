import type { Category, Faq, Media, Post, Product, ProductImage, User } from '../generated/prisma/client.js'

export const userDto = (u: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active' | 'mustChangePassword'> & { createdAt?: Date }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  ...(u.createdAt ? { createdAt: u.createdAt } : {}),
})

type Variants = { width: number; key: string; url: string }[]

/** Legacy snake_case fields keep the existing admin media page working; new fields are additive. */
export const mediaDto = (m: Media) => ({
  id: m.id,
  filename: m.filename,
  path: m.key,
  url: m.url,
  mime_type: m.mimeType,
  size: m.size,
  created_at: m.createdAt,
  alt: m.alt,
  width: m.width,
  height: m.height,
  variants: ((m.variants as Variants | null) ?? []).map((v) => ({ width: v.width, url: v.url })),
  uploadedById: m.uploadedById,
})

export const mediaRef = (m: Media | null | undefined, alt = '') =>
  m
    ? {
        id: m.id,
        url: m.url,
        alt: alt || m.alt,
        width: m.width,
        height: m.height,
        variants: ((m.variants as Variants | null) ?? []).map((v) => ({ width: v.width, url: v.url })),
      }
    : null

const faqDto = (f: Faq) => ({ id: f.id, question: f.question, answer: f.answer })

type ProductFull = Product & {
  category: Category
  images: (ProductImage & { media: Media })[]
  faqs: Faq[]
}

/** `showPrices` is the site-wide switch: when off, the public JSON never carries a price and every product reads as request-a-quote. */
export function productDto(p: ProductFull, admin = false, showPrices = true) {
  const priced = showPrices || admin
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    model: p.model,
    categoryId: p.categoryId,
    category: { id: p.category.id, slug: p.category.slug, name: p.category.name },
    summary: p.summary,
    description: p.description,
    specs: p.specs,
    dimensions: p.dimensions,
    capacity: p.capacity,
    power: p.power,
    applications: p.applications,
    availability: p.availability,
    priceMode: priced ? p.priceMode : 'QUOTE',
    price: priced && p.priceMode === 'PRICE' && p.price != null ? Number(p.price) : null,
    currency: p.currency,
    warranty: p.warranty,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    sortOrder: p.sortOrder,
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
    images: [...p.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ mediaId: i.mediaId, ...mediaRef(i.media, i.alt)! })),
    faqs: [...p.faqs].sort((a, b) => a.sortOrder - b.sortOrder).map(faqDto),
    ...(admin ? { status: p.status, createdAt: p.createdAt } : {}),
  }
}

type CategoryFull = Category & { image: Media | null; faqs: Faq[]; _count?: { products: number } }

export function categoryDto(c: CategoryFull, admin = false) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    h1: c.h1 || c.name,
    intro: c.intro,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    imageId: c.imageId,
    image: mediaRef(c.image, c.imageAlt),
    imageAlt: c.imageAlt,
    sortOrder: c.sortOrder,
    publishedAt: c.publishedAt,
    updatedAt: c.updatedAt,
    faqs: [...c.faqs].sort((a, b) => a.sortOrder - b.sortOrder).map(faqDto),
    ...(c._count ? { productCount: c._count.products } : {}),
    ...(admin ? { status: c.status, createdAt: c.createdAt } : {}),
  }
}

type PostFull = Post & {
  coverImage: Media | null
  author: Pick<User, 'id' | 'name'> | null
  category: Category | null
  products: Product[]
}

export function postDto(p: PostFull, admin = false) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    body: p.body,
    coverImageId: p.coverImageId,
    cover: mediaRef(p.coverImage, p.coverAlt),
    coverAlt: p.coverAlt,
    author: p.author ? { id: p.author.id, name: p.author.name } : null,
    tags: p.tags,
    categoryId: p.categoryId,
    category: p.category ? { id: p.category.id, slug: p.category.slug, name: p.category.name } : null,
    productIds: p.products.map((x) => x.id),
    products: p.products.map((x) => ({ id: x.id, slug: x.slug, name: x.name })),
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
    ...(admin ? { status: p.status, createdAt: p.createdAt } : {}),
  }
}
