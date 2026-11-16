import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { audit } from '../lib/audit.js'
import { conflict, notFound } from '../lib/errors.js'
import { temporaryPassword } from '../lib/hash.js'
import { idParam } from '../lib/http.js'
import { userDto } from '../lib/serialize.js'
import { requirePermission } from '../middleware/auth.js'

export const usersRouter = Router()
usersRouter.use(requirePermission('users:manage'))

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } })
  res.json(users.map(userDto))
})

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['ADMIN', 'EDITOR']).default('EDITOR'),
})

usersRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body)
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict('A user with this email already exists')
  const temp = temporaryPassword()
  const user = await prisma.user.create({
    data: { ...input, passwordHash: await bcrypt.hash(temp, 12), mustChangePassword: true },
  })
  await audit(req.user!.id, 'user.create', 'User', user.id, { role: user.role })
  // The temporary password is shown once here and never stored in plain text.
  res.status(201).json({ ...userDto(user), temporaryPassword: temp })
})

async function activeAdminsExcluding(id: number) {
  return prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } })
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'EDITOR']).optional(),
  active: z.boolean().optional(),
})

usersRouter.patch('/:id', async (req, res) => {
  const id = idParam(req)
  const input = patchSchema.parse(req.body)
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw notFound()

  const losesAdmin =
    target.role === 'ADMIN' && target.active && (input.role === 'EDITOR' || input.active === false)
  if (losesAdmin && (await activeAdminsExcluding(id)) === 0) {
    throw conflict('The last active admin cannot be demoted or deactivated')
  }

  const updated = await prisma.user.update({ where: { id }, data: input })
  if (input.active === false || (input.role && input.role !== target.role)) {
    await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
  }
  await audit(req.user!.id, 'user.update', 'User', id, input)
  res.json(userDto(updated))
})

usersRouter.post('/:id/reset-password', async (req, res) => {
  const id = idParam(req)
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw notFound()
  const temp = temporaryPassword()
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(temp, 12), mustChangePassword: true } }),
    prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ])
  await audit(req.user!.id, 'user.reset-password', 'User', id)
  res.json({ ...userDto({ ...target, mustChangePassword: true }), temporaryPassword: temp })
})
