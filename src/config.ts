import { z } from 'zod'

// Local runs read ./.env (Prisma 7 no longer does this for us). On Vercel there is no file and real env vars are used.
try { process.loadEnvFile() } catch { /* no .env file */ }

const csv = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  IP_HASH_SALT: z.string().min(8).default('masfig-dev-salt'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_SITE_URL: z.string().default('https://masfig.com'),
  SESSION_DAYS: z.coerce.number().default(7),

  STORAGE_DRIVER: z.enum(['r2', 'memory', 'disk']).default('r2'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  /** Local development only (STORAGE_DRIVER=disk): where files are written. Serve this folder statically. */
  DISK_STORAGE_DIR: z.string().optional(),

  CF_PAGES_DEPLOY_HOOK_URL: z.string().url().optional().or(z.literal('')),
  RESEND_API_KEY: z.string().optional(),
  ENQUIRY_NOTIFY_EMAIL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
})

export type Config = ReturnType<typeof loadConfig>

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment configuration — ${issues}`)
  }
  const e = parsed.data
  if (e.NODE_ENV === 'production' && e.IP_HASH_SALT === 'masfig-dev-salt') {
    throw new Error('Invalid environment configuration — IP_HASH_SALT must be set in production')
  }
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    ipHashSalt: e.IP_HASH_SALT,
    corsOrigins: csv(e.CORS_ORIGINS),
    publicSiteUrl: e.PUBLIC_SITE_URL.replace(/\/$/, ''),
    sessionDays: e.SESSION_DAYS,
    storage: {
      driver: e.STORAGE_DRIVER,
      accountId: e.R2_ACCOUNT_ID,
      accessKeyId: e.R2_ACCESS_KEY_ID,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY,
      bucket: e.R2_BUCKET,
      publicUrl: e.R2_PUBLIC_URL?.replace(/\/$/, ''),
      diskDir: e.DISK_STORAGE_DIR,
    },
    deployHookUrl: e.CF_PAGES_DEPLOY_HOOK_URL || undefined,
    resendApiKey: e.RESEND_API_KEY,
    notifyEmail: e.ENQUIRY_NOTIFY_EMAIL,
    mailFrom: e.MAIL_FROM,
  }
}

export const config = loadConfig()
