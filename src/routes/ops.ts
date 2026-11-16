import { Router } from 'express'
import { prisma } from '../db.js'
import { audit } from '../lib/audit.js'
import { pageParams } from '../lib/http.js'
import { triggerRebuild } from '../lib/rebuild.js'
import { requirePermission } from '../middleware/auth.js'

export const opsRouter = Router()

opsRouter.post('/rebuild', requirePermission('rebuild:trigger'), async (req, res) => {
  const rebuild = await triggerRebuild('manual')
  await audit(req.user!.id, 'site.rebuild', 'Site', null, { result: rebuild })
  res.status(rebuild === 'triggered' ? 202 : rebuild === 'not_configured' ? 503 : 502).json({ rebuild })
})

opsRouter.get('/audit-log', requirePermission('audit:read'), async (req, res) => {
  const { limit, offset } = pageParams(req, 50, 200)
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: limit, skip: offset, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.auditLog.count(),
  ])
  res.json({ items, total })
})
