import { defineConfig } from 'prisma/config'

// Prisma 7 does not read .env by itself.
try { process.loadEnvFile() } catch { /* no .env file: rely on real environment variables */ }

// Migrations use the direct (non-pooled) Neon connection when provided; runtime uses DATABASE_URL (pooled).
// If neither is set this points at an unreachable placeholder so the error names the problem instead of
// silently connecting to some other database.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://user:pass@DATABASE_URL-and-DIRECT_URL-not-set.invalid:5432/db',
  },
})
