export interface SeedPost {
  slug: string; title: string; excerpt: string; body: string
  tags: string[]; categorySlug: string; productSlugs: string[]
  motif: string; style: 'split' | 'band' | 'circle'; second: string; coverAlt: string
  seoTitle: string; seoDescription: string
}
