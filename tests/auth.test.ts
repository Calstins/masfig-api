import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { app, auth, login, makeUser, PASSWORD, resetDb, tokenFor } from './helpers.js'

beforeEach(resetDb)

describe('auth', () => {
  it('logs in and returns token + user without the password hash', async () => {
    await makeUser('ADMIN', 'a@masfig.test')
    const { res } = await login('a@masfig.test')
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user).toMatchObject({ email: 'a@masfig.test', role: 'ADMIN' })
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('rejects wrong password and unknown email with the same message', async () => {
    await makeUser('ADMIN', 'a@masfig.test')
    const a = await login('a@masfig.test', 'wrong-password')
    const b = await login('nobody@masfig.test', 'whatever')
    expect(a.res.status).toBe(401)
    expect(b.res.status).toBe(401)
    expect(a.res.body.error).toBe(b.res.body.error)
  })

  it('throttles after 5 failures in a minute (429) even with the right password', async () => {
    await makeUser('ADMIN', 'a@masfig.test')
    for (let i = 0; i < 5; i++) expect((await login('a@masfig.test', 'bad-password-1')).res.status).toBe(401)
    const blocked = await login('a@masfig.test')
    expect(blocked.res.status).toBe(429)
    expect(blocked.res.headers['retry-after']).toBe('60')
  })

  it('logout revokes the token', async () => {
    const { token } = await tokenFor('ADMIN')
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200)
    expect((await request(app).post('/api/auth/logout').set(auth(token))).body).toEqual({ success: true })
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401)
  })

  it('rejects missing, garbage and wrongly signed tokens', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set(auth('garbage'))).status).toBe(401)
    const jwt = (await import('jsonwebtoken')).default
    const forged = jwt.sign({ sub: '1' }, 'another-secret-another-secret-12345', { jwtid: 'x' })
    expect((await request(app).get('/api/auth/me').set(auth(forged))).status).toBe(401)
  })

  it('a deactivated user loses access immediately, and cannot log in again', async () => {
    const { user, token } = await tokenFor('EDITOR')
    await prisma.user.update({ where: { id: user.id }, data: { active: false } })
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401)
    expect((await login(user.email)).res.status).toBe(401)
  })

  it('a role change is effective on the very next request with the old token', async () => {
    const { user, token } = await tokenFor('ADMIN', 'b@masfig.test')
    expect((await request(app).get('/api/admin/users').set(auth(token))).status).toBe(200)
    await prisma.user.update({ where: { id: user.id }, data: { role: 'EDITOR' } })
    expect((await request(app).get('/api/admin/users').set(auth(token))).status).toBe(403)
  })

  it('forces a password change before any permissioned action, then clears the flag', async () => {
    const u = await makeUser('EDITOR', 'e@masfig.test', { mustChangePassword: true })
    const { token } = await login(u.email)
    const blocked = await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Ovens' })
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200)

    const weak = await request(app).post('/api/auth/change-password').set(auth(token)).send({ currentPassword: PASSWORD, newPassword: 'short' })
    expect(weak.status).toBe(422)
    const ok = await request(app).post('/api/auth/change-password').set(auth(token)).send({ currentPassword: PASSWORD, newPassword: 'a-much-better-password' })
    expect(ok.status).toBe(200)
    expect((await request(app).post('/api/admin/categories').set(auth(token)).send({ name: 'Ovens' })).status).toBe(201)
    expect((await login(u.email, 'a-much-better-password')).res.status).toBe(200)
  })

  it('accepts a Laravel $2y$ bcrypt hash after prefix normalisation (migrated admin)', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const laravelStyle = (await bcrypt.hash('legacy-password', 10)).replace('$2b$', '$2y$')
    await prisma.user.create({ data: { name: 'Legacy', email: 'legacy@masfig.test', role: 'ADMIN', passwordHash: laravelStyle.replace('$2y$', '$2b$') } })
    expect((await login('legacy@masfig.test', 'legacy-password')).res.status).toBe(200)
  })
})
