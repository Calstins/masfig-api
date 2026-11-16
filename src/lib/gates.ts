// Publish gates: pure functions returning the list of problems that block publishing.
// Saving a draft is always allowed; only publishing is gated.

export const SEO_TITLE = { min: 10, max: 70 }
export const SEO_DESC = { min: 50, max: 170 }
export const MIN_PRODUCT_DESCRIPTION = 120
export const MIN_CATEGORY_INTRO = 150
export const MIN_POST_EXCERPT = 50
export const MIN_POST_BODY = 600

function seo(title: string, description: string, out: string[]) {
  if (title.trim().length < SEO_TITLE.min || title.trim().length > SEO_TITLE.max)
    out.push(`SEO title must be ${SEO_TITLE.min}-${SEO_TITLE.max} characters`)
  if (description.trim().length < SEO_DESC.min || description.trim().length > SEO_DESC.max)
    out.push(`SEO description must be ${SEO_DESC.min}-${SEO_DESC.max} characters`)
}

export interface ProductGateInput {
  name: string
  slug: string
  description: string
  seoTitle: string
  seoDescription: string
  priceMode: 'QUOTE' | 'PRICE'
  price: number | null
  images: { alt: string }[]
  categoryPublished: boolean
}

export function productGate(p: ProductGateInput): string[] {
  const out: string[] = []
  if (!p.name.trim()) out.push('Name is required')
  if (!p.slug.trim()) out.push('Slug is required')
  if (!p.categoryPublished) out.push('Category must be published first')
  if (p.description.trim().length < MIN_PRODUCT_DESCRIPTION)
    out.push(`Description must be at least ${MIN_PRODUCT_DESCRIPTION} characters`)
  if (p.images.length < 1) out.push('At least one image is required')
  if (p.images.some((i) => !i.alt.trim())) out.push('Every image needs alt text')
  if (p.priceMode === 'PRICE' && !(p.price != null && p.price > 0)) out.push('A price greater than zero is required in PRICE mode')
  seo(p.seoTitle, p.seoDescription, out)
  return out
}

export interface CategoryGateInput {
  name: string
  slug: string
  intro: string
  seoTitle: string
  seoDescription: string
  hasImage: boolean
  imageAlt: string
}

export function categoryGate(c: CategoryGateInput): string[] {
  const out: string[] = []
  if (!c.name.trim()) out.push('Name is required')
  if (!c.slug.trim()) out.push('Slug is required')
  if (c.intro.trim().length < MIN_CATEGORY_INTRO) out.push(`Intro must be at least ${MIN_CATEGORY_INTRO} characters`)
  if (!c.hasImage) out.push('A category image is required')
  else if (!c.imageAlt.trim()) out.push('Category image needs alt text')
  seo(c.seoTitle, c.seoDescription, out)
  return out
}

export interface PostGateInput {
  title: string
  slug: string
  excerpt: string
  body: string
  hasCover: boolean
  coverAlt: string
  seoTitle: string
  seoDescription: string
}

export function postGate(p: PostGateInput): string[] {
  const out: string[] = []
  if (!p.title.trim()) out.push('Title is required')
  if (!p.slug.trim()) out.push('Slug is required')
  if (p.excerpt.trim().length < MIN_POST_EXCERPT) out.push(`Excerpt must be at least ${MIN_POST_EXCERPT} characters`)
  if (p.body.trim().length < MIN_POST_BODY) out.push(`Body must be at least ${MIN_POST_BODY} characters`)
  if (!p.hasCover) out.push('A cover image is required')
  else if (!p.coverAlt.trim()) out.push('Cover image needs alt text')
  seo(p.seoTitle, p.seoDescription, out)
  return out
}
