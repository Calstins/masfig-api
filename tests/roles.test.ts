import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { app, auth, makeUser, readyCategory, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

describe('role enforcement (server-side)', () => {
  it('EDITOR is refused on admin-only endpoints; ADMIN is allowed', async () => {
    const editor = await tokenFor('EDITOR')
    const admin = await tokenFor('ADMIN')
    const checks: [string, string][] = [
      ['get', '/api/admin/users'],
      ['post', '/api/admin/users'],
      ['post', '/api/admin/rebuild'],
      ['get', '/api/admin/audit-log'],
      ['post', '/api/sections/hero'],
      ['post', '/api/theme'],
    ]
    for (const [method, path] of checks) {
      const r = await (request(app) as any)[method](path).set(auth(editor.token)).send({})
      expect(r.status, `${method} ${path} as editor`).toBe(403)
    }
    expect((await request(app).get('/api/admin/users').set(auth(admin.token))).status).toBe(200)
    expect((await request(app).get('/api/admin/audit-log').set(auth(admin.token))).status).toBe(200)
  })

  it('EDITOR can create, edit and publish content but cannot delete it', async () => {
    const editor = await tokenFor('EDITOR')
    const admin = await tokenFor('ADMIN', 'admin2@masfig.test')
    const { category } = await readyCategory(editor.token)
    const pub = await request(app).post(`/api/admin/categories/${category.id}/publish`).set(auth(editor.token))
    expect(pub.status).toBe(200)
    expect((await request(app).delete(`/api/admin/categories/${category.id}`).set(auth(editor.token))).status).toBe(403)
    expect((await request(app).delete(`/api/admin/categories/${category.id}`).set(auth(admin.token))).status).toBe(200)
  })

  it('unauthenticated requests never reach admin routes', async () => {
    for (const path of ['/api/admin/categories', '/api/admin/products', '/api/admin/posts', '/api/admin/enquiries', '/api/admin/users', '/api/media']) {
      expect((await request(app).get(path)).status, path).toBe(401)
    }
  })

  it('admin creates an editor with a one-time temporary password that forces a change', async () => {
    const admin = await tokenFor('ADMIN')
    const created = await request(app).post('/api/admin/users').set(auth(admin.token)).send({ name: 'New Editor', email: 'New.Editor@masfig.test' })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ role: 'EDITOR', email: 'new.editor@masfig.test', mustChangePassword: true })
    expect(created.body.temporaryPassword.length).toBeGreaterThanOrEqual(12)
    const stored = await prisma.user.findUnique({ where: { email: 'new.editor@masfig.test' } })
    expect(stored!.passwordHash).not.toContain(created.body.temporaryPassword)
    const dupe = await request(app).post('/api/admin/users').set(auth(admin.token)).send({ name: 'Dupe', email: 'new.editor@masfig.test' })
    expect(dupe.status).toBe(409)
  })

  it('the last active admin cannot be demoted or deactivated', async () => {
    const admin = await tokenFor('ADMIN')
    const demote = await request(app).patch(`/api/admin/users/${admin.user.id}`).set(auth(admin.token)).send({ role: 'EDITOR' })
    expect(demote.status).toBe(409)
    const off = await request(app).patch(`/api/admin/users/${admin.user.id}`).set(auth(admin.token)).send({ active: false })
    expect(off.status).toBe(409)
    const second = await makeUser('ADMIN', 'second@masfig.test')
    expect((await request(app).patch(`/api/admin/users/${second.id}`).set(auth(admin.token)).send({ active: false })).status).toBe(200)
  })

  it('reset-password issues a new temporary password and revokes that user\'s sessions', async () => {
    const admin = await tokenFor('ADMIN')
    const editor = await tokenFor('EDITOR')
    const r = await request(app).post(`/api/admin/users/${editor.user.id}/reset-password`).set(auth(admin.token))
    expect(r.status).toBe(200)
    expect(r.body.temporaryPassword).toBeTruthy()
    expect((await request(app).get('/api/auth/me').set(auth(editor.token))).status).toBe(401)
  })

  it('sensitive actions are written to the audit log (admin-readable only)', async () => {
    const admin = await tokenFor('ADMIN')
    await request(app).post('/api/admin/users').set(auth(admin.token)).send({ name: 'Ed', email: 'ed@masfig.test' })
    const log = await request(app).get('/api/admin/audit-log').set(auth(admin.token))
    expect(log.body.items.map((i: { action: string }) => i.action)).toContain('user.create')
  })
})
