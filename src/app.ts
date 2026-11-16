import { responseCache } from './lib/response-cache.js'
import cors from 'cors'
import express, { Router, type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { ZodError } from 'zod'
import { config } from './config.js'
import { prisma } from './db.js'
import { HttpError } from './lib/errors.js'
import { authenticate } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { contentRouter } from './routes/content.js'
import { enquiryAdminRouter, enquiryPublicRouter } from './routes/enquiries.js'
import { mediaRouter, sectionsRouter, themeRouter } from './routes/legacy.js'
import { opsRouter } from './routes/ops.js'
import { siteRouter, siteAdminRouter } from './routes/site.js'
import { publicRouter } from './routes/public.js'
import { usersRouter } from './routes/users.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1) // Vercel puts the client address in X-Forwarded-For
  app.disable('x-powered-by')
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients send no Origin header; browsers must be on the allow-list.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true)
        cb(null, false)
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  const api = Router()
  api.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true })
  })

  api.use(responseCache(['/sections', '/sections/tracking', '/catalog', '/hero-slides']))

  // Same paths as the Laravel API.
  api.use('/auth', authRouter)
  api.use('/sections', sectionsRouter)
  api.use('/theme', themeRouter)
  api.use('/media', mediaRouter)

  // Public catalogue and enquiries.
  api.use('/enquiries', enquiryPublicRouter)
  api.use(publicRouter)
  api.use(siteRouter)

  // Everything under /admin requires a valid session; each route then checks its permission.
  const admin = Router()
  admin.use(authenticate)
  admin.use('/users', usersRouter)
  admin.use('/enquiries', enquiryAdminRouter)
  admin.use(opsRouter)
  admin.use(contentRouter)
  admin.use(siteAdminRouter)
  api.use('/admin', admin)

  // Opening the API address in a browser shows this, so a fresh deployment can be confirmed at a glance.
  app.get('/', (_req, res) => {
    res.json({ message: 'Successful deployment', service: 'MASFIG API', status: 'ok' })
  })

  app.use('/api', api)
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...err.extra })
      return
    }
    if (err instanceof ZodError) {
      res.status(422).json({
        error: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
      return
    }
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 4 MB)' : `Upload error: ${err.message}`
      res.status(422).json({ error: msg })
      return
    }
    const type = (err as { type?: string }).type
    if (type === 'entity.parse.failed') {
      res.status(422).json({ error: 'Invalid JSON payload' })
      return
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large' })
      return
    }
    const code = (err as { code?: string }).code
    if (code === 'P2002') {
      res.status(409).json({ error: 'A record with this value already exists' })
      return
    }
    if (code === 'P2003' || code === 'P2025') {
      res.status(422).json({ error: 'A referenced record does not exist' })
      return
    }
    console.error('[error]', (err as Error).stack ?? err)
    res.status(500).json({ error: 'Server error' })
  }
  app.use(onError)
  return app
}
