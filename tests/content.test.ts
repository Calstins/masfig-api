import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, auth, longText, pngBuffer, readyCategory, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

async function productPayload(token: string, categoryId: number, over: Record<string, unknown> = {}) {
  const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(900, 600), 'oven.png')
  return {
    name: 'Industrial Deck Oven',
    categoryId,
    brand: 'Polystar',
    model: 'PS-4D16',
    description: longText(200),
    seoTitle: 'Industrial Deck Oven for Bakeries | MASFIG',
    seoDescription: longText(100, 'Four-deck electric oven for commercial bakeries. '),
    images: [{ mediaId: up.body.id, alt: 'Four deck oven' }],
    ...over,
  }
}

describe('categories and products', () => {
  it('draft saves freely; publish is gated and lists exactly what is missing', async () => {
    const { token } = await tokenFor('EDITOR')
    const c = await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Bakery Equipment' })
    expect(c.status).toBe(201)
    expect(c.body.slug).toBe('bakery-equipment')
    expect(c.body.status).toBe('DRAFT')
    const pub = await request(app).post(`/api/admin/categories/${c.body.id}/publish`).set(auth(token))
    expect(pub.status).toBe(422)
    expect(pub.body.missing.join(' ')).toMatch(/Intro must be at least 150/)
    expect(pub.body.missing.join(' ')).toMatch(/category image is required/)
    expect(pub.body.missing.join(' ')).toMatch(/SEO title/)
  })

  it('a product cannot publish until its category is published, then publishes with a rebuild', async () => {
    const { token } = await tokenFor('EDITOR')
    const { category } = await readyCategory(token)
    const body = await productPayload(token, category.id)
    const p = await request(app).post('/api/admin/products').set(auth(token)).send(body)
    expect(p.status).toBe(201)
    expect(p.body.priceMode).toBe('QUOTE')
    expect(p.body.price).toBeNull()

    const early = await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))
    expect(early.status).toBe(422)
    expect(early.body.missing).toContain('Category must be published first')

    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(token))
    const ok = await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('PUBLISHED')
    expect(ok.body.rebuild).toBe('triggered')
    expect(ok.body.publishedAt).toBeTruthy()
  })

  it('PRICE mode needs a positive price; QUOTE mode never stores one', async () => {
    const { token } = await tokenFor('EDITOR')
    const { category } = await readyCategory(token)
    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(token))
    const p = await request(app).post('/api/admin/products').set(auth(token)).send(await productPayload(token, category.id, { priceMode: 'PRICE' }))
    const bad = await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))
    expect(bad.status).toBe(422)
    expect(bad.body.missing.join(' ')).toMatch(/price greater than zero/)
    const set = await request(app).put(`/api/admin/products/${p.body.id}`).set(auth(token)).send({ price: 1250000 })
    expect(set.body.price).toBe(1250000)
    expect((await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))).status).toBe(200)
    const back = await request(app).put(`/api/admin/products/${p.body.id}`).set(auth(token)).send({ priceMode: 'QUOTE', price: 999 })
    expect(back.body.price).toBeNull()
  })

  it('a published product cannot be edited into an unpublishable state or have its slug changed', async () => {
    const { token } = await tokenFor('EDITOR')
    const { category } = await readyCategory(token)
    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(token))
    const p = await request(app).post('/api/admin/products').set(auth(token)).send(await productPayload(token, category.id))
    await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))

    const shorten = await request(app).put(`/api/admin/products/${p.body.id}`).set(auth(token)).send({ description: 'too short' })
    expect(shorten.status).toBe(422)
    expect(shorten.body.missing.join(' ')).toMatch(/Description must be at least/)
    const stillThere = await request(app).get(`/api/products/${p.body.slug}`)
    expect(stillThere.body.description.length).toBeGreaterThan(100)

    const slug = await request(app).put(`/api/admin/products/${p.body.id}`).set(auth(token)).send({ slug: 'new-slug' })
    expect(slug.status).toBe(409)
  })

  it('category with published products cannot be unpublished; one with products cannot be deleted', async () => {
    const editor = await tokenFor('EDITOR')
    const admin = await tokenFor('ADMIN')
    const { category } = await readyCategory(editor.token)
    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(editor.token))
    const p = await request(app).post('/api/admin/products').set(auth(editor.token)).send(await productPayload(editor.token, category.id))
    await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(editor.token))
    expect((await request(app).post(`/api/admin/categories/${category.id}/unpublish`).set(auth(editor.token))).status).toBe(409)
    expect((await request(app).delete(`/api/admin/categories/${category.id}`).set(auth(admin.token))).status).toBe(409)
  })

  it('duplicate slugs are rejected with 409, invalid slugs with 422', async () => {
    const { token } = await tokenFor('EDITOR')
    await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Ovens', slug: 'ovens' })
    expect((await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Other', slug: 'ovens' })).status).toBe(409)
    expect((await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Other', slug: 'Bad Slug!' })).status).toBe(422)
  })

  it('FAQs are saved with their owner and replaced wholesale on update', async () => {
    const { token } = await tokenFor('EDITOR')
    const c = await request(app).post('/api/admin/categories').set(auth(token)).send({
      name: 'Fridges',
      faqs: [{ question: 'Do you deliver?', answer: 'Yes, nationwide.' }, { question: 'Warranty?', answer: 'Per product.' }],
    })
    expect(c.body.faqs).toHaveLength(2)
    const u = await request(app).put(`/api/admin/categories/${c.body.id}`).set(auth(token)).send({ faqs: [{ question: 'Installation?', answer: 'On request.' }] })
    expect(u.body.faqs).toEqual([expect.objectContaining({ question: 'Installation?' })])
  })

  it('rejects a category image that does not exist with 422', async () => {
    const { token } = await tokenFor('EDITOR')
    const r = await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Ghost', imageId: 9999 })
    expect(r.status).toBe(422)
  })
})

describe('public visibility', () => {
  it('drafts and products in unpublished categories are invisible; catalog is consistent', async () => {
    const { token } = await tokenFor('EDITOR')
    const pubCat = (await readyCategory(token, 'Bakery Equipment')).category
    const draftCat = (await readyCategory(token, 'Hidden Category')).category
    await request(app).post(`/api/admin/categories/${pubCat.id}/publish`).set(auth(token))

    const live = await request(app).post('/api/admin/products').set(auth(token)).send(await productPayload(token, pubCat.id, { name: 'Live Oven' }))
    await request(app).post(`/api/admin/products/${live.body.id}/publish`).set(auth(token))
    await request(app).post('/api/admin/products').set(auth(token)).send(await productPayload(token, pubCat.id, { name: 'Draft Oven' }))
    await request(app).post('/api/admin/products').set(auth(token)).send(await productPayload(token, draftCat.id, { name: 'Orphan Oven' }))

    const catalog = await request(app).get('/api/catalog')
    expect(catalog.status).toBe(200)
    expect(catalog.body.categories.map((c: any) => c.slug)).toEqual(['bakery-equipment'])
    expect(catalog.body.products.map((p: any) => p.name)).toEqual(['Live Oven'])
    expect(catalog.headers['cache-control']).toContain('s-maxage')

    expect((await request(app).get('/api/products/draft-oven')).status).toBe(404)
    expect((await request(app).get('/api/categories/hidden-category')).status).toBe(404)
    expect((await request(app).get('/api/products/live-oven')).status).toBe(200)
    const list = await request(app).get('/api/products?category=bakery-equipment')
    expect(list.body.total).toBe(1)
    // public payloads carry no admin-only fields
    expect(list.body.items[0].status).toBeUndefined()
    expect((await request(app).get('/api/categories')).body[0].productCount).toBe(1)
  })
})

describe('posts', () => {
  const postBody = (cover: number, over: Record<string, unknown> = {}) => ({
    title: 'How to choose a commercial bakery oven',
    excerpt: longText(80, 'A practical guide to deck ovens, rotary ovens and capacity. '),
    body: longText(900, 'Choosing an oven starts with your daily output and your floor space. '),
    coverImageId: cover,
    coverAlt: 'Bakery with deck ovens',
    seoTitle: 'How to Choose a Commercial Bakery Oven | MASFIG',
    seoDescription: longText(100, 'Deck, rotary and convection ovens compared for Nigerian bakeries. '),
    tags: ['Ovens', 'ovens', 'Buying Guide'],
    ...over,
  })

  it('editor drafts, gates and publishes a post; tags are normalised; author is recorded', async () => {
    const { token, user } = await tokenFor('EDITOR')
    const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(), 'cover.png')
    const draft = await request(app).post('/api/admin/posts').set(auth(token)).send({ title: 'Draft only' })
    expect(draft.status).toBe(201)
    expect((await request(app).post(`/api/admin/posts/${draft.body.id}/publish`).set(auth(token))).status).toBe(422)

    const p = await request(app).post('/api/admin/posts').set(auth(token)).send(postBody(up.body.id))
    expect(p.body.tags).toEqual(['ovens', 'buying guide'])
    expect(p.body.author.id).toBe(user.id)
    const pub = await request(app).post(`/api/admin/posts/${p.body.id}/publish`).set(auth(token))
    expect(pub.status).toBe(200)

    const list = await request(app).get('/api/posts')
    expect(list.body.total).toBe(1)
    expect((await request(app).get(`/api/posts/${p.body.slug}`)).body.title).toBe('How to choose a commercial bakery oven')
    expect((await request(app).get('/api/posts?tag=ovens')).body.total).toBe(1)
    expect((await request(app).get('/api/posts?tag=none')).body.total).toBe(0)
  })

  it('unpublishing removes a post from the public API', async () => {
    const { token } = await tokenFor('EDITOR')
    const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(), 'cover.png')
    const p = await request(app).post('/api/admin/posts').set(auth(token)).send(postBody(up.body.id))
    await request(app).post(`/api/admin/posts/${p.body.id}/publish`).set(auth(token))
    await request(app).post(`/api/admin/posts/${p.body.id}/unpublish`).set(auth(token))
    expect((await request(app).get(`/api/posts/${p.body.slug}`)).status).toBe(404)
  })
})
