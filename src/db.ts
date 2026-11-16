import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'
import { config } from './config.js'

const g = globalThis as unknown as { __prisma?: PrismaClient }

// One client per serverless instance; the pooled Neon URL keeps connection counts low.
export const prisma: PrismaClient =
  g.__prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl, max: config.env === 'test' ? 4 : 5 }),
  })

if (config.env !== 'production') g.__prisma = prisma

export type Db = typeof prisma
