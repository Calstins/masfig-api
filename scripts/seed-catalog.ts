/**
 * Seeds the MASFIG catalogue through the admin API, so every publish rule is enforced exactly as in the CMS.
 *
 *   SEED_ADMIN_EMAIL=you@masfig.com SEED_ADMIN_PASSWORD='...' npm run seed:catalog
 *   (optional) SEED_API_URL=http://localhost:8000/api
 *
 * Creates, from the supplied PDF catalogue (scripts/seed/data/catalog-extracted.json + scripts/seed/photos/catalog):
 *   - 10 categories, ~326 products (quote only, no invented specs), one hero slide per category,
 *   - 30 comprehensive SEO guides incl. 15 Nigeria/Lagos kitchen + supermarket guides (published as blog posts) + the 10 earlier guides, re-pointed to the new categories,
 *   - missing contact details from the catalogue, the light red/white theme, price display OFF (request a quote).
 * Everything stays editable in the admin. RESUMABLE: records are matched by slug, anything that already exists is left
 * untouched (so your admin edits are never overwritten), and only missing records / images / publishing are filled in.
 * If a run stops (network etc.), run it again and it continues. Add --update (or SEED_UPDATE=1) to deliberately
 * overwrite existing seed records with the script's text.
 *
 * Tip: unset CF_PAGES_DEPLOY_HOOK_URL in the API's environment while seeding; the script triggers ONE rebuild at the end.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PRODUCTS as V1_PRODUCTS } from './seed/data/catalog.js'
import { CATEGORIES } from './seed/data/categories.js'
import { buildProduct, type Extracted } from './seed/data/product-copy.js'
import { SEO_A } from './seed/data/seo-pages-a.js'
import { SEO_B } from './seed/data/seo-pages-b.js'
import { SEO_NG_A } from './seed/data/seo-nigeria-a.js'
import { SEO_NG_B } from './seed/data/seo-nigeria-b.js'
import { POSTS_A } from './seed/data/posts-a.js'
import { POSTS_B } from './seed/data/posts-b.js'
import { makeCover } from './seed/covers.js'
import extracted from './seed/data/catalog-extracted.json' with { type: 'json' }

const API = (process.env.SEED_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')
const EMAIL = process.env.SEED_ADMIN_EMAIL
const PASSWORD = process.env.SEED_ADMIN_PASSWORD
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PHOTOS = path.join(HERE, 'seed', 'photos')
const CATALOG_PHOTOS = path.join(PHOTOS, 'catalog')

/** Used only when the API has no settings section yet (a brand new database). Mirrors the site's built-in defaults. */
const BASE_SETTINGS = {
  siteName: 'MASFIG LTD', tagline: 'Premium Commercial Equipment',
  metaTitle: 'MASFIG LTD - Premium Commercial Equipment',
  metaDescription: 'Commercial kitchen, bakery, refrigeration, supermarket and food processing equipment supplied from Lagos, Nigeria.',
  phone1: '+2348033345066', phone2: '+2348096134860', whatsapp: '2348033345066',
  copyright: 'MASFIG LTD. All rights reserved.', logo: '/logo-main.png', callLabel: 'Call', whatsappLabel: 'WhatsApp',
}

const THEME = {
  background: '#ffffff', foreground: '#231f20', card: '#ffffff', card_foreground: '#231f20',
  popover: '#ffffff', popover_foreground: '#231f20', primary: '#a83236', primary_foreground: '#ffffff',
  secondary: '#f6f4f2', secondary_foreground: '#231f20', muted: '#f6f4f2', muted_foreground: '#4a4446',
  accent: '#faf1f1', accent_foreground: '#a83236', destructive: '#a83236', ring: '#a83236',
}

let token = ''

const UPDATE = process.env.SEED_UPDATE === '1' || process.argv.includes('--update')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One API call. Network errors and 408/429/5xx are retried with backoff, so a flaky connection does not stop the run. */
async function call<T = any>(method: string, route: string, body?: unknown, form?: FormData): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}${route}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(form ? {} : { 'Content-Type': 'application/json' }) },
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      })
      if ([408, 429, 502, 503, 504].includes(res.status) && attempt < 6) { await sleep(1500 * attempt); continue }
      const text = await res.text()
      let json: any = {}
      try { json = text ? JSON.parse(text) : {} } catch { json = { error: text.slice(0, 200) } }
      if (!res.ok) { const e: any = new Error(`${method} ${route} -> ${res.status} ${JSON.stringify(json.missing ?? json.error ?? json.errors ?? json)}`); e.status = res.status; throw e }
      return json as T
    } catch (err: any) {
      if (err.status || attempt >= 6) throw err
      console.log(`  network problem (${err.cause?.code ?? err.message}), retrying ${attempt}/5...`)
      await sleep(1500 * attempt)
    }
  }
}

async function upload(buffer: Buffer, filename: string, mime = 'image/jpeg'): Promise<number> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename)
  const media = await call<{ id: number }>('POST', '/media', undefined, form)
  return media.id
}

const log = (msg: string) => console.log(msg)
const failures: string[] = []
const fail = (what: string, e: any) => { failures.push(`${what}: ${String(e.message).slice(0, 160)}`); console.log(`  FAILED    ${what}`) }

/** "Kitchen Hood (3-6) Feet" -> "Kitchen Hood (3-6 Feet)"; "Gas Shawarma Machine (2/3/4,) Burner" -> "... (2/3/4 Burner)". */
export function normalizeName(raw: string): string {
  let n = raw.replace(/\s+/g, ' ').replace(/,\s*\)/g, ')').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').trim()
  n = n.replace(/\(([^)]+)\)\s+(Feet|Foot|Inches|Inch|Litres?|Burners?|Trays?|Kg|Doors?)\b\s*(.*)$/i, (_m, inner: string, unit: string, rest: string) => {
    const base = n.slice(0, n.indexOf('(')).trim()
    const extra = rest.trim()
    const keep = extra && !base.toLowerCase().includes(extra.toLowerCase()) ? ` ${extra}` : ''
    return `(${inner} ${unit})${keep}`.replace(/^/, '')
  })
  return n.replace(/\s+/g, ' ').trim()
}

const slugify = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)

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

const mediaCache = new Map<string, number>()
async function uploadCatalog(file: string): Promise<number> {
  const hit = mediaCache.get(file)
  if (hit) return hit
  const id = await upload(await readFile(path.join(CATALOG_PHOTOS, file)), file)
  mediaCache.set(file, id)
  return id
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD')
  const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (!login.ok) throw new Error(`Login failed (${login.status}). Check the email, password and SEED_API_URL.`)
  token = (await login.json()).token
  log(`Signed in to ${API}`)

  // ---- normalise catalogue items ----
  const items = (extracted as Extracted[]).map((e) => ({ ...e, display: normalizeName(e.name) }))
  const nameCount = new Map<string, number>()
  for (const it of items) nameCount.set(it.display.toLowerCase(), (nameCount.get(it.display.toLowerCase()) ?? 0) + 1)
  const v1Slugs = new Set(V1_PRODUCTS.map((p) => p.slug))
  const used = new Set<string>(v1Slugs)
  const catBySection = new Map(CATEGORIES.map((c) => [c.section, c]))
  const planned = items.map((it) => {
    const cat = catBySection.get(it.section)
    if (!cat) throw new Error(`No category for section ${it.section}`)
    let slug = slugify(it.display)
    if (used.has(slug)) slug = slugify(`${it.display} ${cat.name.split(' ')[0]}`)
    let n = 2
    const base = slug
    while (used.has(slug)) slug = `${base}-${n++}`
    used.add(slug)
    return { it, cat, slug, dup: (nameCount.get(it.display.toLowerCase()) ?? 0) > 1 }
  })

  // ---- categories ----
  const existingCats = await listAll('/admin/categories')
  const catId = new Map<string, number>()
  for (const c of CATEGORIES) {
    const hero = planned.find((p) => p.cat === c && c.heroPick.test(p.it.display) && p.it.images.length)
      ?? planned.find((p) => p.cat === c && p.it.images.length)
    if (!hero) throw new Error(`No image available for category ${c.slug}`)
    const found = existingCats.find((x) => x.slug === c.slug)
    const payload = { name: c.name, h1: c.h1, intro: c.intro, seoTitle: c.seoTitle, seoDescription: c.seoDescription, imageAlt: c.imageAlt, faqs: c.faqs, sortOrder: CATEGORIES.indexOf(c) }
    let row = found ? (UPDATE ? await call('PUT', `/admin/categories/${found.id}`, payload) : found) : await call('POST', '/admin/categories', { ...payload, slug: c.slug })
    if (!row.imageId || (UPDATE && found?.imageAlt !== c.imageAlt)) {
      const imageId = await uploadCatalog(hero.it.images[0])
      row = await call('PUT', `/admin/categories/${row.id}`, { imageId, imageAlt: c.imageAlt })
    }
    if (row.status !== 'PUBLISHED') row = await call('POST', `/admin/categories/${row.id}/publish`)
    catId.set(c.slug, row.id)
    log(`  category  ${c.slug}`)
  }

  // ---- products: the 6 earlier products, then the catalogue ----
  const existingProducts = await listAll('/admin/products')
  const prodId = new Map<string, number>()
  const heroImage = new Map<string, { id: number; alt: string }>()

  for (const p of V1_PRODUCTS) {
    const found = existingProducts.find((x) => x.slug === p.slug)
    const payload = {
      name: p.name, categoryId: catId.get(p.category)!, summary: p.summary, description: p.description, specs: p.specs,
      capacity: p.capacity, power: p.power, applications: p.applications, availability: 'ON_REQUEST', priceMode: 'QUOTE',
      seoTitle: p.seoTitle, seoDescription: p.seoDescription, faqs: p.faqs,
    }
    let row = found ? (UPDATE ? await call('PUT', `/admin/products/${found.id}`, payload) : found) : await call('POST', '/admin/products', { ...payload, slug: p.slug })
    if (!row.images?.length) {
      const mediaId = await upload(await readFile(path.join(PHOTOS, p.photo)), p.photo)
      row = await call('PUT', `/admin/products/${row.id}`, { images: [{ mediaId, alt: p.imageAlt }] })
    }
    if (row.status !== 'PUBLISHED') row = await call('POST', `/admin/products/${row.id}/publish`)
    prodId.set(p.slug, row.id)
  }
  log(`  products  ${V1_PRODUCTS.length} earlier products re-categorised`)

  let done = 0
  const catalogNames: { id: number; name: string; slug: string }[] = []
  for (const [idx, { it, cat, slug, dup }] of planned.entries()) {
    try {
    const rec = buildProduct(it, it.display, cat, dup)
    const found = existingProducts.find((x) => x.slug === slug)
    const payload = {
      name: rec.name, categoryId: catId.get(cat.slug)!, summary: rec.summary, description: rec.description,
      specs: rec.specs, capacity: rec.capacity || undefined, applications: rec.applications,
      availability: 'ON_REQUEST', priceMode: 'QUOTE', seoTitle: rec.seoTitle, seoDescription: rec.seoDescription,
      faqs: rec.faqs, sortOrder: 100 + idx,
    }
    let row = found ? (UPDATE ? await call('PUT', `/admin/products/${found.id}`, payload) : found) : await call('POST', '/admin/products', { ...payload, slug }).catch(async (e) => { if (e.status !== 409) throw e; const again = (await listAll('/admin/products')).find((x) => x.slug === slug); if (!again) throw e; return again })
    if (!row.images?.length) {
      const imgs: { mediaId: number; alt: string }[] = []
      for (const [i, file] of it.images.slice(0, 4).entries()) imgs.push({ mediaId: await uploadCatalog(file), alt: rec.imageAlts[i] ?? `${rec.name} supplied by MASFIG LTD` })
      row = await call('PUT', `/admin/products/${row.id}`, { images: imgs })
    }
    if (row.status !== 'PUBLISHED') row = await call('POST', `/admin/products/${row.id}/publish`)
    prodId.set(slug, row.id)
    catalogNames.push({ id: row.id, name: it.display, slug })
    done++
    if (done % 50 === 0) log(`  products  ${done}/${planned.length}`)
    } catch (e: any) { fail(`product ${it.display}`, e) }
  }
  log(`  products  ${done} catalogue products published`)

  // ---- hero slides: one per category, using that category's showcase product image ----
  const existingSlides: any[] = await call('GET', '/admin/hero-slides')
  for (const [i, c] of CATEGORIES.entries()) {
    const hero = planned.find((p) => p.cat === c && c.heroPick.test(p.it.display) && p.it.images.length) ?? planned.find((p) => p.cat === c && p.it.images.length)!
    const found = existingSlides.find((x) => x.categoryId === catId.get(c.slug))
    const payload = {
      eyebrow: c.hero.eyebrow, title: c.hero.title, subtitle: c.hero.subtitle, categoryId: catId.get(c.slug)!,
      imageAlt: c.imageAlt, sortOrder: i, active: true, linkUrl: '',
    }
    if (found) { if (UPDATE || !found.image) await call('PUT', `/admin/hero-slides/${found.id}`, found.image ? payload : { ...payload, imageId: await uploadCatalog(hero.it.images[0]) }) }
    else await call('POST', '/admin/hero-slides', { ...payload, imageId: await uploadCatalog(hero.it.images[0]) })
  }
  log(`  hero      ${CATEGORIES.length} slides (one per category)`)

  // ---- blog posts: earlier guides + 15 SEO guides ----
  const existingPosts = await listAll('/admin/posts')
  const styles = ['split', 'band', 'circle'] as const
  for (const p of [...POSTS_A, ...POSTS_B]) {
    try {
    const found = existingPosts.find((x: any) => x.slug === p.slug)
    const payload = {
      title: p.title, excerpt: p.excerpt, body: p.body, coverAlt: p.coverAlt, tags: p.tags, categoryId: catId.get(p.categorySlug)!,
      productIds: p.productSlugs.map((s) => prodId.get(s)!).filter(Boolean), seoTitle: p.seoTitle, seoDescription: p.seoDescription,
    }
    let row = found ? (UPDATE ? await call('PUT', `/admin/posts/${found.id}`, payload) : found) : await call('POST', '/admin/posts', { ...payload, slug: p.slug })
    if (!row.coverImageId) {
      const coverImageId = await upload(await makeCover(p.motif, p.style ?? styles[0], p.second), `${p.slug}.jpg`)
      row = await call('PUT', `/admin/posts/${row.id}`, { coverImageId, coverAlt: p.coverAlt })
    }
    if (row.status !== 'PUBLISHED') row = await call('POST', `/admin/posts/${row.id}/publish`)
    } catch (e: any) { fail(`post ${p.slug}`, e) }
  }
  log(`  posts     ${POSTS_A.length + POSTS_B.length} earlier guides updated`)

  for (const p of [...SEO_A, ...SEO_B, ...SEO_NG_A, ...SEO_NG_B]) {
    try {
    const find = (rx: RegExp) => planned.find((x) => rx.test(x.it.display) && x.it.images.length)
    const cover = find(p.coverPick) ?? planned.find((x) => x.cat.slug === p.categorySlug && x.it.images.length)!
    const productIds = [...new Set(p.productPicks.map((rx) => find(rx)).filter(Boolean).map((x) => prodId.get(x!.slug)!))].slice(0, 6)
    const found = existingPosts.find((x: any) => x.slug === p.slug)
    const payload = {
      title: p.title, excerpt: p.excerpt, body: p.body, coverAlt: p.coverAlt, tags: p.tags, categoryId: catId.get(p.categorySlug)!,
      productIds, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
    }
    let row = found ? (UPDATE ? await call('PUT', `/admin/posts/${found.id}`, payload) : found) : await call('POST', '/admin/posts', { ...payload, slug: p.slug })
    if (!row.coverImageId) {
      row = await call('PUT', `/admin/posts/${row.id}`, { coverImageId: await uploadCatalog(cover.it.images[0]), coverAlt: p.coverAlt })
    }
    if (row.status !== 'PUBLISHED') row = await call('POST', `/admin/posts/${row.id}/publish`)
    } catch (e: any) { fail(`seo page ${p.slug}`, e) }
  }
  log(`  seo pages ${SEO_A.length + SEO_B.length + SEO_NG_A.length + SEO_NG_B.length} comprehensive guides published`)

  if (failures.length) {
    console.log(`\n${failures.length} item(s) failed:\n - ${failures.join('\n - ')}`)
    throw new Error('Some items failed (usually a network problem). Nothing is lost: run the same command again and it will continue, skipping everything already created.')
  }

  // ---- remove the earlier categories that are now empty ----
  for (const slug of ['commercial-kitchen', 'catering-systems', 'hotel-hospitality', 'advanced-packaging']) {
    const old = (await listAll('/admin/categories')).find((x) => x.slug === slug)
    if (!old) continue
    try { await call('DELETE', `/admin/categories/${old.id}`); log(`  removed   obsolete category ${slug}`) } catch (e: any) { log(`  kept      ${slug} (${e.message.slice(0, 90)})`) }
  }

  // ---- settings: add what the catalogue has and the site lacks; never overwrite ----
  const res = await fetch(`${API}/sections/settings`)
  const current: Record<string, any> = res.ok ? await res.json() : { ...BASE_SETTINGS }
  const digits = (v?: string) => (v ?? '').replace(/\D/g, '').replace(/^234/, '0')
  const known = new Set([digits(current.phone1), digits(current.phone2), digits(current.phone3)])
  const next: Record<string, any> = { ...current }
  const extraPhone = ['08033345066', '08096134860', '08033607993'].find((n) => !known.has(n))
  if (!current.phone3 && extraPhone) next.phone3 = `+234${extraPhone.slice(1)}`
  next.address ||= 'AS 11 Astron Plaza, Ojo Intl Trade Centre, Opposite Airtel Office, Ojo Alaba, Lagos State'
  next.branchAddress ||= 'P4 A13/14 Divine Mandate Plaza, Mile 10 Bustop Volks, Ojo Alaba, Lagos State'
  next.instagram ||= 'https://instagram.com/masfigltd'
  next.facebook ||= 'https://facebook.com/masfig'
  next.twitter ||= 'https://x.com/masfigltd'
  if (typeof next.showPrices !== 'boolean') next.showPrices = false
  await call('POST', '/sections/settings', next)
  log('  settings  contact details merged, price display OFF (request a quote)')

  // ---- theme + rebuild ----
  await call('POST', '/theme', THEME)
  log('  theme     light red/white applied')
  try { await call('POST', '/admin/rebuild'); log('  rebuild   triggered') } catch { log('  rebuild   not configured (trigger it from the admin dashboard when ready)') }
  log('Done.')
}

main().catch((e) => { console.error(`\nSeed failed: ${e.message}`); process.exit(1) })
