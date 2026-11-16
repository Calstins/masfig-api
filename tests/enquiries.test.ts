import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { app, auth, longText, pngBuffer, readyCategory, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

const valid = { name: 'Ada Okoye', phone: '+234 803 334 5066', message: 'I need a quote for two deck ovens.' }

describe('enquiries', () => {
  it('stores a valid enquiry with UTM data and returns 201', async () => {
    const res = await request(app).post('/api/enquiries').send({ ...valid, utmSource: 'facebook', utmCampaign: 'ovens-nov', pageUrl: 'https://masfig.com/equipment/' })
    expect(res.status).toBe(201)
    const row = await prisma.enquiry.findFirstOrThrow()
    expect(row).toMatchObject({ name: 'Ada Okoye', utmSource: 'facebook', utmCampaign: 'ovens-nov', status: 'NEW', kind: 'QUOTE' })
    expect(row.ipHash).toHaveLength(64)
  })

  it('validates input', async () => {
    expect((await request(app).post('/api/enquiries').send({ ...valid, phone: 'abc' })).status).toBe(422)
    expect((await request(app).post('/api/enquiries').send({ ...valid, name: 'A' })).status).toBe(422)
    expect((await request(app).post('/api/enquiries').send({ ...valid, email: 'not-an-email' })).status).toBe(422)
    expect((await request(app).post('/api/enquiries').send({ ...valid, message: '' })).status).toBe(422)
    expect(await prisma.enquiry.count()).toBe(0)
  })

  it('honeypot submissions are dropped silently', async () => {
    const res = await request(app).post('/api/enquiries').send({ ...valid, website: 'http://spam.example' })
    expect(res.status).toBe(201)
    expect(await prisma.enquiry.count()).toBe(0)
  })

  it('rate-limits to 5 per hour per address', async () => {
    for (let i = 0; i < 5; i++) expect((await request(app).post('/api/enquiries').send(valid)).status).toBe(201)
    const sixth = await request(app).post('/api/enquiries').send(valid)
    expect(sixth.status).toBe(429)
    expect(sixth.headers['retry-after']).toBe('3600')
  })

  it('links a published product and snapshots its name; unknown or draft products are refused', async () => {
    const { token } = await tokenFor('EDITOR')
    const { category } = await readyCategory(token)
    await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(token))
    const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(), 'p.png')
    const p = await request(app).post('/api/admin/products').set(auth(token)).send({
      name: 'Spiral Dough Mixer', categoryId: category.id, description: longText(200),
      seoTitle: 'Spiral Dough Mixer | MASFIG', seoDescription: longText(100, 'Heavy duty spiral mixer. '),
      images: [{ mediaId: up.body.id, alt: 'Mixer' }],
    })
    expect((await request(app).post('/api/enquiries').send({ ...valid, productId: p.body.id })).status).toBe(422)
    await request(app).post(`/api/admin/products/${p.body.id}/publish`).set(auth(token))
    expect((await request(app).post('/api/enquiries').send({ ...valid, productId: p.body.id })).status).toBe(201)
    const row = await prisma.enquiry.findFirstOrThrow()
    expect(row).toMatchObject({ productName: 'Spiral Dough Mixer', categoryId: category.id })
  })

  it('staff can list and mark enquiries handled; the IP hash is never exposed', async () => {
    await request(app).post('/api/enquiries').send(valid)
    const { token } = await tokenFor('EDITOR')
    const list = await request(app).get('/api/admin/enquiries').set(auth(token))
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].ipHash).toBeUndefined()
    const id = list.body.items[0].id
    const done = await request(app).post(`/api/admin/enquiries/${id}/handled`).set(auth(token)).send({ handled: true })
    expect(done.body.status).toBe('HANDLED')
    expect((await request(app).get('/api/admin/enquiries?status=NEW').set(auth(token))).body.total).toBe(0)
  })
})
