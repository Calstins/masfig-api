import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { getStorage, MemoryStorage } from '../src/lib/storage.js'
import { app, auth, pngBuffer, readyCategory, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

describe('media', () => {
  it('stores the original plus WebP variants smaller than the original width', async () => {
    const { token } = await tokenFor('EDITOR')
    const res = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(1800, 900), 'big.png')
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ filename: 'big.png', mime_type: 'image/png', width: 1800, height: 900 })
    expect(res.body.variants.map((v: any) => v.width)).toEqual([480, 960, 1600])
    const store = getStorage() as MemoryStorage
    expect(store.files.size).toBe(4)
    expect([...store.files.keys()].filter((k) => k.endsWith('.webp'))).toHaveLength(3)
  })

  it('small images get no oversized variants', async () => {
    const { token } = await tokenFor('EDITOR')
    const res = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(400, 300), 'small.png')
    expect(res.body.variants).toEqual([])
  })

  it('rejects SVG, non-images, disguised files and oversize uploads', async () => {
    const { token } = await tokenFor('EDITOR')
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect((await request(app).post('/api/media').set(auth(token)).attach('file', svg, 'x.svg')).status).toBe(422)
    expect((await request(app).post('/api/media').set(auth(token)).attach('file', Buffer.from('hello'), 'x.png')).status).toBe(422)
    const over = await request(app).post('/api/media').set(auth(token)).attach('file', Buffer.alloc(5 * 1024 * 1024, 1), 'huge.png')
    expect(over.status).toBe(422)
    expect(over.body.error).toMatch(/too large/i)
  })

  it('multi-upload reports per-file errors without losing good files', async () => {
    const { token } = await tokenFor('EDITOR')
    const res = await request(app)
      .post('/api/media')
      .set(auth(token))
      .attach('files', await pngBuffer(), 'ok.png')
      .attach('files', Buffer.from('nope'), 'bad.png')
    expect(res.status).toBe(201)
    expect(res.body.media).toHaveLength(1)
    expect(res.body.errors).toEqual([{ filename: 'bad.png', error: 'Not a valid image file' }])
  })

  it("accepts the PHP-style 'files[]' field name used by the existing admin page", async () => {
    const { token } = await tokenFor('EDITOR')
    const res = await request(app).post('/api/media').set(auth(token)).attach('files[]', await pngBuffer(), 'one.png').attach('files[]', await pngBuffer(), 'two.png')
    expect(res.status).toBe(201)
    expect(res.body.media).toHaveLength(2)
  })

  it('requires auth; no files gives 422', async () => {
    expect((await request(app).post('/api/media')).status).toBe(401)
    const { token } = await tokenFor('EDITOR')
    const none = await request(app).post('/api/media').set(auth(token))
    expect(none.status).toBe(422)
    expect(none.body).toEqual({ error: 'No files uploaded' })
  })

  it('editors delete only their own media; admins any; in-use media is protected', async () => {
    const e1 = await tokenFor('EDITOR', 'e1@masfig.test')
    const e2 = await tokenFor('EDITOR', 'e2@masfig.test')
    const admin = await tokenFor('ADMIN')
    const mine = await request(app).post('/api/media').set(auth(e1.token)).attach('file', await pngBuffer(), 'a.png')
    const theirs = await request(app).post('/api/media').set(auth(e2.token)).attach('file', await pngBuffer(), 'b.png')

    expect((await request(app).delete(`/api/media/${theirs.body.id}`).set(auth(e1.token))).status).toBe(403)
    expect((await request(app).delete(`/api/media/${theirs.body.id}`).set(auth(admin.token))).status).toBe(200)
    expect((await request(app).delete(`/api/media/${mine.body.id}`).set(auth(e1.token))).body).toEqual({ success: true })
    expect((await request(app).delete(`/api/media/${mine.body.id}`).set(auth(e1.token))).status).toBe(404)

    const { media } = await readyCategory(e1.token)
    const inUse = await request(app).delete(`/api/media/${media.id}`).set(auth(admin.token))
    expect(inUse.status).toBe(409)
    expect(inUse.body.usedBy.categories).toBe(1)
  })

  it('deleting removes the original and every variant from storage', async () => {
    const { token } = await tokenFor('EDITOR')
    const store = getStorage() as MemoryStorage
    store.files.clear()
    const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(1800, 900), 'big.png')
    expect(store.files.size).toBe(4)
    await request(app).delete(`/api/media/${up.body.id}`).set(auth(token))
    expect(store.files.size).toBe(0)
  })
})
