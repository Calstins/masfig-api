import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/db.js'

export const app = createApp()
export const PASSWORD = 'correct-horse-battery'

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditLog","Enquiry","_PostToProduct","Post","Faq","ProductImage","Product","Category","Media","Session","LoginAttempt","HeroSlide","Section","SiteTheme","User" RESTART IDENTITY CASCADE`,
  )
}

export async function makeUser(role: 'ADMIN' | 'EDITOR', email = `${role.toLowerCase()}@masfig.test`, extra: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { name: `${role} user`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4), ...extra },
  })
}

export async function login(email: string, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  return { res, token: res.body.token as string }
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function tokenFor(role: 'ADMIN' | 'EDITOR', email?: string) {
  const u = await makeUser(role, email)
  const { token } = await login(u.email)
  return { user: u, token }
}

export async function pngBuffer(width = 1200, height = 800) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 20 } } }).png().toBuffer()
}

export const longText = (n: number, seed = 'Commercial bakery equipment built for Nigerian businesses. ') => seed.repeat(Math.ceil(n / seed.length)).slice(0, n)

/** Create a category + media fully ready to publish. */
export async function readyCategory(token: string, name = 'Bakery Equipment', slug?: string) {
  const up = await request(app).post('/api/media').set(auth(token)).attach('file', await pngBuffer(), 'cat.png')
  const res = await request(app)
    .post('/api/admin/categories')
    .set(auth(token))
    .send({
      name,
      ...(slug ? { slug } : {}),
      intro: longText(200),
      seoTitle: `${name} in Nigeria | MASFIG`,
      seoDescription: longText(100, `${name} supplied and installed across Nigeria. `),
      imageId: up.body.id,
      imageAlt: `${name} installed in a bakery`,
    })
  return { category: res.body, media: up.body, res }
}
