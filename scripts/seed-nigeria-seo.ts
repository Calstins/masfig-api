/**
 * Applies the Nigeria / Lagos SEO update to an EXISTING site, through the admin API:
 *   1. rewrites the meta title, meta description and H1 of the 10 categories (so they say Nigeria / Lagos),
 *   2. creates and publishes the 15 industrial kitchen + supermarket equipment guides (blog posts).
 *
 *   SEED_ADMIN_EMAIL=you@masfig.com SEED_ADMIN_PASSWORD='...' SEED_API_URL=https://<your-api>/api npm run seed:nigeria-seo
 *
 * Safe to re-run: posts are matched by slug, so existing ones are skipped (add --update to overwrite their text).
 * Category meta tags are always written (that is the point of this script). Nothing else is touched.
 * Tip: unset CF_PAGES_DEPLOY_HOOK_URL while running, then trigger one rebuild of the site at the end.
 */
import { CATEGORIES } from './seed/data/categories.js'
import { SEO_NG_A } from './seed/data/seo-nigeria-a.js'
import { SEO_NG_B } from './seed/data/seo-nigeria-b.js'

const API = (process.env.SEED_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')
const EMAIL = process.env.SEED_ADMIN_EMAIL
const PASSWORD = process.env.SEED_ADMIN_PASSWORD
const UPDATE = process.env.SEED_UPDATE === '1' || process.argv.includes('--update')
let token = ''
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function call<T = any>(method: string, route: string, body?: unknown): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}${route}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if ([408, 429, 502, 503, 504].includes(res.status) && attempt < 6) { await sleep(1500 * attempt); continue }
      const text = await res.text()
      let json: any = {}
      try { json = text ? JSON.parse(text) : {} } catch { json = { error: text.slice(0, 200) } }
      if (!res.ok) { const e: any = new Error(`${method} ${route} -> ${res.status} ${JSON.stringify(json.missing ?? json.error ?? json.errors ?? json)}`); e.status = res.status; throw e }
      return json as T
    } catch (err: any) {
      if (err.status || attempt >= 6) throw err
      await sleep(1500 * attempt)
    }
  }
}

async function listAll(route: string): Promise<any[]> {
  const out: any[] = []
  for (;;) {
    const r: any = await call('GET', `${route}${route.includes('?') ? '&' : '?'}limit=200&offset=${out.length}`)
    const items: any[] = Array.isArray(r) ? r : r.items
    out.push(...items)
    if (Array.isArray(r) || items.length < 200) break
  }
  return out
}

/** Category H1s with Nigeria / Lagos added (the intro text and everything else stay as they are). */
const H1: Record<string, string> = {
  'bakery-equipment': 'Bakery Equipment in Nigeria: Ovens, Mixers & Dough Machines',
  'cooking-equipment': 'Industrial Kitchen Equipment in Nigeria: Gas Cookers, Fryers & Grills',
  'food-processing': 'Food Processing Machines in Nigeria: Juicers, Grinders & Cutters',
  'fast-food-restaurant-equipment': 'Restaurant & Fast Food Equipment in Nigeria and Lagos',
  'refrigeration-equipment': 'Commercial Refrigeration in Nigeria: Display Chillers & Freezers',
  'kitchen-furniture-cabinets': 'Stainless Steel Kitchen Equipment in Nigeria: Worktables, Sinks & Hoods',
  'supermarket-equipment': 'Supermarket Equipment in Nigeria: Gondola Shelves, Trolleys & Chillers',
  'water-production-packaging': 'Water Production & Packaging Equipment in Nigeria',
  'laundry-equipment': 'Commercial Laundry Equipment in Nigeria: Washers, Dryers & Ironers',
  'sound-lighting-stage': 'Sound, Lighting & Stage Equipment in Nigeria for Events and Venues',
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD')
  const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (!login.ok) throw new Error(`Login failed (${login.status}). Check the email, password and SEED_API_URL.`)
  const auth = (await login.json()) as any
  token = auth.token ?? auth.accessToken
  if (!token) throw new Error('Login response had no token')

  // 1. category meta tags
  const cats = await listAll('/admin/categories')
  const catId = new Map<string, number>()
  for (const c of cats) catId.set(c.slug, c.id)
  for (const c of CATEGORIES) {
    const id = catId.get(c.slug)
    if (!id) { console.log(`  skipped   category ${c.slug} (not on this site)`); continue }
    await call('PUT', `/admin/categories/${id}`, { seoTitle: c.seoTitle, seoDescription: c.seoDescription, h1: H1[c.slug] ?? c.h1 })
    console.log(`  category  ${c.slug}`)
  }

  // 2. posts (cover image = the first photo of a matching product already on the site)
  const products = await listAll('/admin/products')
  const existing = await listAll('/admin/posts')
  const failures: string[] = []
  for (const p of [...SEO_NG_A, ...SEO_NG_B]) {
    try {
      const match = (rx: RegExp) => products.find((x) => rx.test(x.name) && x.images?.length)
      const cover = match(p.coverPick) ?? products.find((x) => x.category?.slug === p.categorySlug && x.images?.length)
      const productIds = [...new Set(p.productPicks.map(match).filter(Boolean).map((x) => x!.id))].slice(0, 6)
      const payload = { title: p.title, excerpt: p.excerpt, body: p.body, coverAlt: p.coverAlt, tags: p.tags, categoryId: catId.get(p.categorySlug) ?? null, productIds, seoTitle: p.seoTitle, seoDescription: p.seoDescription }
      const found = existing.find((x: any) => x.slug === p.slug)
      let row = found ? (UPDATE ? await call('PUT', `/admin/posts/${found.id}`, payload) : found) : await call('POST', '/admin/posts', { ...payload, slug: p.slug })
      if (!row.coverImageId && !row.coverImage) {
        if (!cover) throw new Error('no product photo found for the cover; run the catalogue seed first')
        row = await call('PUT', `/admin/posts/${row.id}`, { coverImageId: cover.images[0].mediaId, coverAlt: p.coverAlt })
      }
      if (row.status !== 'PUBLISHED') row = await call('POST', `/admin/posts/${row.id}/publish`)
      console.log(`  post      ${p.slug}`)
    } catch (e: any) { failures.push(`${p.slug}: ${String(e.message).slice(0, 200)}`); console.log(`  FAILED    ${p.slug}`) }
  }
  if (failures.length) { console.log(`\n${failures.length} failed:\n - ${failures.join('\n - ')}`); process.exitCode = 1 }
  else console.log(`\nDone: ${CATEGORIES.length} categories updated, ${SEO_NG_A.length + SEO_NG_B.length} posts published. Now rebuild the site (Cloudflare Pages) so the pages go live.`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
