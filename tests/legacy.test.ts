import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { app, auth, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

const hero = { badge: 'Premium', heading: 'Equipment', ctaPrimary: { text: 'Call', href: 'tel:+234' } }

describe('legacy API contract (Laravel-compatible)', () => {
  it('GET /sections returns [{slug,data}] for valid slugs only', async () => {
    await prisma.section.createMany({ data: [{ slug: 'hero', data: hero }, { slug: 'unknown', data: {} }] })
    const res = await request(app).get('/api/sections')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ slug: 'hero', data: hero }])
  })

  it('GET /sections/:slug returns the bare data; 400 invalid slug; 404 missing', async () => {
    await prisma.section.create({ data: { slug: 'hero', data: hero } })
    expect((await request(app).get('/api/sections/hero')).body).toEqual(hero)
    const bad = await request(app).get('/api/sections/nope')
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ error: 'Invalid section' })
    const missing = await request(app).get('/api/sections/stats')
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ error: 'Section not found' })
  })

  it('POST /sections/:slug needs auth and an ADMIN; saves and returns {success, section}', async () => {
    expect((await request(app).post('/api/sections/hero').send(hero)).status).toBe(401)
    const editor = await tokenFor('EDITOR')
    expect((await request(app).post('/api/sections/hero').set(auth(editor.token)).send(hero)).status).toBe(403)
    const admin = await tokenFor('ADMIN')
    const res = await request(app).post('/api/sections/hero').set(auth(admin.token)).send(hero)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, section: hero })
    expect((await request(app).get('/api/sections/hero')).body).toEqual(hero)
  })

  it('never wipes content on malformed, array or oversized payloads', async () => {
    const admin = await tokenFor('ADMIN')
    await request(app).post('/api/sections/hero').set(auth(admin.token)).send(hero)

    const arr = await request(app).post('/api/sections/hero').set(auth(admin.token)).send([1, 2])
    expect(arr.status).toBe(422)
    expect(arr.body).toEqual({ error: 'Invalid JSON payload' })

    const broken = await request(app).post('/api/sections/hero').set(auth(admin.token)).set('Content-Type', 'application/json').send('{"a":')
    expect(broken.status).toBe(422)

    const big = await request(app).post('/api/sections/hero').set(auth(admin.token)).send({ blob: 'x'.repeat(210_000) })
    expect(big.status).toBe(413)
    expect(big.body).toEqual({ error: 'Payload too large' })

    expect((await request(app).get('/api/sections/hero')).body).toEqual(hero)
  })

  it('theme: defaults to {}, validates hex colours, admin only', async () => {
    expect((await request(app).get('/api/theme')).body).toEqual({})
    const admin = await tokenFor('ADMIN')
    const bad = await request(app).post('/api/theme').set(auth(admin.token)).send({ primary: 'red' })
    expect(bad.status).toBe(422)
    expect(bad.body.error).toContain("Invalid theme value for 'primary'")
    expect((await request(app).post('/api/theme').set(auth(admin.token)).send({})).status).toBe(422)
    const ok = await request(app).post('/api/theme').set(auth(admin.token)).send({ primary: '#f59e0b' })
    expect(ok.body).toMatchObject({ success: true, theme: { primary: '#f59e0b' } })
    expect((await request(app).get('/api/theme')).body).toEqual({ primary: '#f59e0b' })
    const editor = await tokenFor('EDITOR')
    expect((await request(app).post('/api/theme').set(auth(editor.token)).send({ primary: '#fff' })).status).toBe(403)
  })

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nothing-here')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('CORS: allowed origin is echoed, other origins are not', async () => {
    const ok = await request(app).get('/api/sections').set('Origin', 'https://masfig.com')
    expect(ok.headers['access-control-allow-origin']).toBe('https://masfig.com')
    const bad = await request(app).get('/api/sections').set('Origin', 'https://evil.example')
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })
})
