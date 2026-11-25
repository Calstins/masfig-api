import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { app, auth, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
const MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const send = (body: unknown, ua = UA) => request(app).post('/api/track').set('User-Agent', ua).set('Content-Type', 'text/plain').send(typeof body === 'string' ? body : JSON.stringify(body))

describe('first-party tracking', () => {
  it('records a page view without storing the IP, and strips query strings and trailing slashes', async () => {
    const res = await send({ type: 'pageview', path: '/products/cooking-equipment/?utm_source=x#top', ref: 'https://www.google.com/search?q=ovens' })
    expect(res.status).toBe(204)
    const row = await prisma.siteEvent.findFirstOrThrow()
    expect(row).toMatchObject({ type: 'pageview', path: '/products/cooking-equipment', source: 'google.com', device: 'desktop' })
    expect(row.visitor).toHaveLength(16)
    expect(JSON.stringify(row)).not.toMatch(/127\.0\.0\.1|::1|Mozilla/)
  })

  it('uses the campaign source when present, and detects mobile', async () => {
    await send({ type: 'whatsapp_click', path: '/', label: 'navbar', utm: 'Facebook' }, MOBILE)
    expect(await prisma.siteEvent.findFirstOrThrow()).toMatchObject({ type: 'whatsapp_click', label: 'navbar', source: 'facebook', device: 'mobile' })
  })

  it('ignores bots and rejects malformed events', async () => {
    expect((await send({ type: 'pageview', path: '/' }, 'Mozilla/5.0 (compatible; Googlebot/2.1)')).status).toBe(204)
    expect((await send({ type: 'pageview', path: '/' }, 'HeadlessChrome/120')).status).toBe(204)
    expect(await prisma.siteEvent.count()).toBe(0)
    expect((await send({ type: 'nonsense', path: '/' })).status).toBe(400)
    expect((await send('not json')).status).toBe(400)
    expect((await send({ type: 'pageview', path: '' })).status).toBe(400)
    expect(await prisma.siteEvent.count()).toBe(0)
  })

  it('same visitor on the same day counts once as a visitor but every page counts as a view', async () => {
    for (const path of ['/', '/blog', '/contact']) await send({ type: 'pageview', path })
    await send({ type: 'pageview', path: '/' }, MOBILE)
    const { token } = await tokenFor('ADMIN')
    const r = await request(app).get('/api/admin/analytics?days=7').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.totals).toMatchObject({ pageviews: 4, visitors: 2 })
    expect(r.body.daily).toHaveLength(7)
    expect(r.body.topPages[0]).toMatchObject({ label: '/', count: 2 })
    expect(r.body.devices).toEqual(expect.arrayContaining([{ label: 'desktop', count: 3, visitors: undefined }, { label: 'mobile', count: 1, visitors: undefined }].map((d) => expect.objectContaining({ label: d.label, count: d.count }))))
  })

  it('stats: clicks, product views and quote requests (taken from real enquiries)', async () => {
    await send({ type: 'whatsapp_click', path: '/', label: 'sticky' })
    await send({ type: 'call_click', path: '/', label: 'footer' })
    await send({ type: 'email_click', path: '/contact', label: 'page' })
    await send({ type: 'product_view', path: '/products/a/b', label: 'Deep Fryer' })
    await request(app).post('/api/enquiries').send({ name: 'Ada Okoye', phone: '+234 803 334 5066', message: 'I need a quote please.' })
    const { token } = await tokenFor('ADMIN')
    const r = await request(app).get('/api/admin/analytics').set(auth(token))
    expect(r.body.totals).toMatchObject({ whatsapp: 1, calls: 1, emails: 1, productViews: 1, quotes: 1, pageviews: 0 })
    expect(r.body.whatsappBy).toEqual([{ label: 'sticky', count: 1 }])
    expect(r.body.topProducts).toEqual([{ label: 'Deep Fryer', count: 1 }])
    expect(r.body.daily.at(-1)).toMatchObject({ whatsapp: 1, calls: 1, quotes: 1 })
  })

  it('stats are admin only', async () => {
    expect((await request(app).get('/api/admin/analytics')).status).toBe(401)
    const { token } = await tokenFor('EDITOR')
    expect((await request(app).get('/api/admin/analytics').set(auth(token))).status).toBe(403)
  })

  it('events older than the selected period are excluded', async () => {
    await prisma.siteEvent.create({ data: { type: 'pageview', path: '/old', visitor: 'x', createdAt: new Date(Date.now() - 40 * 86_400_000) } })
    await send({ type: 'pageview', path: '/new' })
    const { token } = await tokenFor('ADMIN')
    const r = await request(app).get('/api/admin/analytics?days=30').set(auth(token))
    expect(r.body.totals.pageviews).toBe(1)
    const r90 = await request(app).get('/api/admin/analytics?days=90').set(auth(token))
    expect(r90.body.totals.pageviews).toBe(2)
  })
})

describe('deleting enquiries', () => {
  const make = (name: string) => prisma.enquiry.create({ data: { name, phone: '08031234567', message: 'Please send a quote' } })

  it('an admin can delete one enquiry, and it is recorded in the audit log', async () => {
    const e = await make('Ada')
    const { token } = await tokenFor('ADMIN')
    const r = await request(app).delete(`/api/admin/enquiries/${e.id}`).set(auth(token))
    expect(r.status).toBe(200)
    expect(await prisma.enquiry.count()).toBe(0)
    expect(await prisma.auditLog.count({ where: { action: 'enquiry.delete' } })).toBe(1)
    expect((await request(app).delete(`/api/admin/enquiries/${e.id}`).set(auth(token))).status).toBe(404)
  })

  it('an admin can delete several at once and unknown ids are ignored', async () => {
    const [a, b, c] = [await make('A'), await make('B'), await make('C')]
    const { token } = await tokenFor('ADMIN')
    const r = await request(app).post('/api/admin/enquiries/delete-many').set(auth(token)).send({ ids: [a.id, b.id, 999999] })
    expect(r.body).toEqual({ ok: true, deleted: 2 })
    expect((await prisma.enquiry.findMany()).map((x) => x.id)).toEqual([c.id])
    expect((await request(app).post('/api/admin/enquiries/delete-many').set(auth(token)).send({ ids: [] })).status).toBe(422)
  })

  it('editors cannot delete enquiries', async () => {
    const e = await make('Ada')
    const { token } = await tokenFor('EDITOR')
    expect((await request(app).delete(`/api/admin/enquiries/${e.id}`).set(auth(token))).status).toBe(403)
    expect((await request(app).post('/api/admin/enquiries/delete-many').set(auth(token)).send({ ids: [e.id] })).status).toBe(403)
    expect(await prisma.enquiry.count()).toBe(1)
  })
})
