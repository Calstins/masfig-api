import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearFeedCache, fetchLatestPosts, mapPost, type Fetcher } from '../src/lib/facebook.js'
import { app, auth, longText, pngBuffer, readyCategory, resetDb, tokenFor } from './helpers.js'

beforeEach(async () => {
  await resetDb()
  clearFeedCache()
})

describe('hero slides', () => {
  it('admin CRUD; editors are refused; public list shows only active slides on live categories', async () => {
    const { token } = await tokenFor('ADMIN')
    const { token: editor } = await tokenFor('EDITOR')
    const { category } = await readyCategory(token)
    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(token))
    const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(), 'h.png')

    expect((await request(app).post('/api/admin/hero-slides').set(auth(editor)).send({ title: 'Nope' })).status).toBe(403)

    const draftCat = await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Hidden Category' })
    const a = await request(app).post('/api/admin/hero-slides').set(auth(token)).send({ title: 'Bakery Equipment', categoryId: category.id, imageId: up.body.id, sortOrder: 1 })
    expect(a.status).toBe(201)
    expect(a.body.category.slug).toBe(category.slug)
    const b = await request(app).post('/api/admin/hero-slides').set(auth(token)).send({ title: 'Inactive', active: false, sortOrder: 2 })
    const c = await request(app).post('/api/admin/hero-slides').set(auth(token)).send({ title: 'Unpublished cat', categoryId: draftCat.body.id, sortOrder: 3 })
    expect(c.status).toBe(201)

    const pub = await request(app).get('/api/hero-slides')
    expect(pub.body.map((s: { title: string }) => s.title)).toEqual(['Bakery Equipment'])
    expect(pub.body[0].image.url).toBeTruthy()

    const upd = await request(app).put(`/api/admin/hero-slides/${b.body.id}`).set(auth(token)).send({ active: true })
    expect(upd.body.active).toBe(true)
    expect((await request(app).get('/api/hero-slides')).body).toHaveLength(2)

    expect((await request(app).post('/api/admin/hero-slides').set(auth(token)).send({ title: 'x', categoryId: 9999 })).status).toBe(422)
    expect((await request(app).delete(`/api/admin/hero-slides/${a.body.id}`).set(auth(token))).status).toBe(200)
    expect((await request(app).delete(`/api/admin/hero-slides/${a.body.id}`).set(auth(token))).status).toBe(404)
  })
})

describe('site-wide price display', () => {
  it('hides prices in public JSON unless settings.showPrices is true', async () => {
    const { token } = await tokenFor('ADMIN')
    const { category } = await readyCategory(token)
    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(token))
    const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(), 'p.png')
    const p = await request(app).post('/api/admin/products').set(auth(token)).send({
      name: 'Planetary Mixer', categoryId: category.id, description: longText(200),
      seoTitle: 'Planetary Mixer for Bakeries | MASFIG', seoDescription: longText(100, 'Heavy duty mixer. '),
      priceMode: 'PRICE', price: 450000, images: [{ mediaId: up.body.id, alt: 'Mixer' }],
    })
    expect((await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))).status).toBe(200)

    const off = await request(app).get('/api/products/planetary-mixer')
    expect(off.body.priceMode).toBe('QUOTE')
    expect(off.body.price).toBeNull()
    expect((await request(app).get('/api/catalog')).body.showPrices).toBe(false)

    await request(app).post('/api/sections/settings').set(auth(token)).send({ showPrices: true })
    const on = await request(app).get('/api/products/planetary-mixer')
    expect(on.body.priceMode).toBe('PRICE')
    expect(on.body.price).toBe(450000)
    // admin always sees the stored value
    await request(app).post('/api/sections/settings').set(auth(token)).send({ showPrices: false })
    const adm = await request(app).get(`/api/admin/products/${p.body.id}`).set(auth(token))
    expect(adm.body.price).toBe(450000)
  })
})

describe('facebook feed', () => {
  const graph = (data: unknown[], ok = true): Fetcher => async () => ({ ok, status: ok ? 200 : 400, json: async () => ({ data }) })
  const cfg = { pageId: '123456789', pageUrl: 'https://facebook.com/masfig', pageName: 'Masfig', accessToken: 'SECRET-TOKEN' }

  it('maps video posts to an embeddable player and image posts to a picture', () => {
    const v = mapPost({ id: '1_1', status_type: 'added_video', permalink_url: 'https://facebook.com/masfig/videos/55', message: 'Oven demo', created_time: '2026-11-01T10:00:00+0000' }, cfg.pageUrl)
    expect(v.isVideo).toBe(true)
    expect(v.videoEmbedUrl).toContain('plugins/video.php?href=' + encodeURIComponent('https://facebook.com/masfig/videos/55'))
    const i = mapPost({ id: '1_2', full_picture: 'https://img/x.jpg', permalink_url: 'https://facebook.com/masfig/posts/9' }, cfg.pageUrl)
    expect(i.isVideo).toBe(false)
    expect(i.videoEmbedUrl).toBeNull()
    expect(i.image).toBe('https://img/x.jpg')
  })

  it('returns at most four posts, caches, and serves the last good copy when the Graph API fails', async () => {
    const six = Array.from({ length: 6 }, (_, n) => ({ id: `p${n}`, message: `m${n}` }))
    const first = await fetchLatestPosts(cfg, graph(six), 1_000)
    expect(first.posts).toHaveLength(4)
    let calls = 0
    const counting: Fetcher = async () => { calls++; return { ok: false, status: 500, json: async () => ({}) } }
    expect((await fetchLatestPosts(cfg, counting, 2_000)).stale).toBe(false)
    expect(calls).toBe(0)
    const later = await fetchLatestPosts(cfg, counting, 1_000 + 10 * 60_000)
    expect(later.stale).toBe(true)
    expect(later.posts).toHaveLength(4)
  })

  it('admin saves the page; the token is never returned; public endpoint reports unconfigured until saved', async () => {
    const { token } = await tokenFor('ADMIN')
    expect((await request(app).get('/api/social/facebook')).body).toMatchObject({ configured: false, posts: [] })
    const bad = await request(app).put('/api/admin/integrations/facebook').set(auth(token)).send({ pageId: 'abc', pageUrl: 'https://facebook.com/masfig', accessToken: 'T' })
    expect(bad.status).toBe(422)
    const noToken = await request(app).put('/api/admin/integrations/facebook').set(auth(token)).send({ pageId: '123456789', pageUrl: 'https://facebook.com/masfig' })
    expect(noToken.status).toBe(422)
    const ok = await request(app).put('/api/admin/integrations/facebook').set(auth(token)).send({ pageId: '123456789', pageUrl: 'https://facebook.com/masfig', accessToken: 'SECRET-TOKEN' })
    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).not.toContain('SECRET-TOKEN')
    const get = await request(app).get('/api/admin/integrations/facebook').set(auth(token))
    expect(get.body).toMatchObject({ pageId: '123456789', hasToken: true })
    expect(JSON.stringify(get.body)).not.toContain('SECRET-TOKEN')
    // token is kept when omitted on a later save
    const keep = await request(app).put('/api/admin/integrations/facebook').set(auth(token)).send({ pageId: '123456789', pageUrl: 'https://facebook.com/masfig2' })
    expect(keep.status).toBe(200)
    // never exposed through the public sections endpoints
    expect((await request(app).get('/api/sections')).body.find((s: { slug: string }) => s.slug === 'integration-facebook')).toBeUndefined()
    expect((await request(app).get('/api/sections/integration-facebook')).status).toBe(400)
    const { token: editor } = await tokenFor('EDITOR')
    expect((await request(app).get('/api/admin/integrations/facebook').set(auth(editor))).status).toBe(403)
  })
})
