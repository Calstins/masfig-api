import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { audit } from '../lib/audit.js'
import { unauthorized, unprocessable, HttpError } from '../lib/errors.js'
import { hashIp } from '../lib/hash.js'
import { userDto } from '../lib/serialize.js'
import { authenticate, signToken } from '../middleware/auth.js'

export const authRouter = Router()

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })

// Constant-cost comparison target so unknown emails cost the same as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12)

const PER_IDENTITY = 5 // failures per minute for one email from one address
const PER_IP = 20 // failures per minute from one address

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)
  const identifier = email.toLowerCase()
  const ipHash = hashIp(req.ip)
  const since = new Date(Date.now() - 60_000)

  const [identityFails, ipFails] = await Promise.all([
    prisma.loginAttempt.count({ where: { identifier, ipHash, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ipHash, success: false, createdAt: { gte: since } } }),
  ])
  if (identityFails >= PER_IDENTITY || ipFails >= PER_IP) {
    res.setHeader('Retry-After', '60')
    throw new HttpError(429, 'Too many login attempts. Try again in a minute.')
  }

  const user = await prisma.user.findUnique({ where: { email: identifier } })
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok || !user.active) {
    await prisma.loginAttempt.create({ data: { identifier, ipHash, success: false } })
    throw unauthorized('Invalid credentials')
  }

  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } })
  const sessionId = randomUUID()
  await prisma.session.create({
    data: { id: sessionId, userId: user.id, expiresAt: new Date(Date.now() + config.sessionDays * 86400_000) },
  })
  await audit(user.id, 'auth.login', 'User', user.id)
  res.json({ token: signToken(user.id, sessionId), user: userDto(user) })
})

authRouter.post('/logout', authenticate, async (req, res) => {
  await prisma.session.update({ where: { id: req.user!.sessionId }, data: { revokedAt: new Date() } })
  res.json({ success: true })
})

authRouter.get('/me', authenticate, async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  res.json(userDto(u))
})

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'New password must be at least 10 characters').max(200),
})

authRouter.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = changeSchema.parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw unprocessable('Current password is incorrect')
  if (currentPassword === newPassword) throw unprocessable('New password must be different')
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false } }),
    prisma.session.updateMany({ where: { userId: user.id, id: { not: req.user!.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
  ])
  await audit(user.id, 'auth.change-password', 'User', user.id)
  res.json({ success: true })
})
