export interface SeoPage {
  slug: string; title: string; excerpt: string; body: string; tags: string[]
  categorySlug: string
  /** Matched against generated product names; first 6 matches are linked to the post. */
  productPicks: RegExp[]
  /** Product whose catalogue image becomes the cover. */
  coverPick: RegExp
  coverAlt: string
  seoTitle: string; seoDescription: string
  /** Primary and supporting keywords researched for the page (written to seo-keywords.md). */
  keywords: string[]
}
const Q = '\n\n## Get a quote\nTell us what you plan to produce or serve, your space and your power or gas supply. Use the quote form on the category page, call MASFIG LTD or message us on WhatsApp, and we will confirm models, availability and delivery. Specifications and prices are confirmed on quotation.'
export const quoteOutro = Q
