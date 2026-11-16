// Run before deploying:  npx tsx scripts/preflight.ts            (checks your local .env)
// Or against the live API: npx tsx scripts/preflight.ts https://your-api.vercel.app
// Prints PASS / WARN / FAIL lines and exits 1 if anything is a FAIL.
try { process.loadEnvFile() } catch { /* no .env: use real environment */ }

let failed = 0
const out = (level: 'PASS' | 'WARN' | 'FAIL', msg: string) => { if (level === 'FAIL') failed++; console.log(`${level}  ${msg}`) }
const env = (k: string) => (process.env[k] ?? '').trim()

async function checkLive(base: string) {
  const url = base.replace(/\/$/, '')
  for (const path of ['/api/health', '/api/catalog', '/api/sections']) {
    const t0 = Date.now()
    try {
      const r = await fetch(url + path, { headers: { Origin: 'https://masfig.com' } })
      const ms = Date.now() - t0
      if (!r.ok) { out('FAIL', `${path} answered ${r.status}`); continue }
      out(ms > 8000 ? 'WARN' : 'PASS', `${path} ok in ${ms} ms${ms > 8000 ? ' (slow: a cold database? run it twice)' : ''}`)
      if (path === '/api/health') {
        const allow = r.headers.get('access-control-allow-origin')
        out(allow === 'https://masfig.com' ? 'PASS' : 'FAIL', `CORS allows https://masfig.com (got ${allow ?? 'nothing'}); set CORS_ORIGINS on Vercel`)
      }
      if (path === '/api/catalog') {
        const j = (await r.json()) as { products?: unknown[]; categories?: unknown[] }
        out((j.products?.length ?? 0) > 0 ? 'PASS' : 'WARN', `catalogue has ${j.categories?.length ?? 0} categories, ${j.products?.length ?? 0} products${(j.products?.length ?? 0) ? '' : ' (seed it before building the site)'}`)
      }
    } catch (e) { out('FAIL', `${path} unreachable: ${(e as Error).message}`) }
  }
}

async function checkEnv() {
  out(env('DATABASE_URL').includes('-pooler') ? 'PASS' : 'WARN', 'DATABASE_URL should be the pooled Neon string (host contains -pooler)')
  out(env('DATABASE_URL') ? 'PASS' : 'FAIL', 'DATABASE_URL is set')
  out(env('DIRECT_URL') ? 'PASS' : 'WARN', 'DIRECT_URL is set (needed only for migrations)')
  out(env('JWT_SECRET').length >= 32 ? 'PASS' : 'FAIL', 'JWT_SECRET has 32+ characters')
  out(env('IP_HASH_SALT') ? 'PASS' : 'FAIL', 'IP_HASH_SALT is set')
  const cors = env('CORS_ORIGINS')
  out(cors.includes('https://masfig.com') ? 'PASS' : 'FAIL', `CORS_ORIGINS includes https://masfig.com (now: ${cors || 'empty'})`)
  out(env('PUBLIC_SITE_URL') === 'https://masfig.com' ? 'PASS' : 'WARN', 'PUBLIC_SITE_URL is https://masfig.com')
  const r2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'].filter((k) => !env(k))
  out(env('STORAGE_DRIVER') === 'r2' && !r2.length ? 'PASS' : 'FAIL', `Cloudflare R2 media settings complete${r2.length ? ` (missing ${r2.join(', ')})` : ''}`)
  out(env('CF_PAGES_DEPLOY_HOOK_URL') ? 'PASS' : 'WARN', 'CF_PAGES_DEPLOY_HOOK_URL set (admin saves rebuild the site). Leave empty while seeding.')
  if (env('DATABASE_URL')) {
    try {
      const { prisma } = await import('../src/db.js')
      const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`
      out(Number(count) > 0 ? 'PASS' : 'FAIL', `database reachable, ${count} migrations applied (run: npm run db:deploy)`)
      const admins = await prisma.user.count({ where: { role: 'ADMIN' } })
      out(admins > 0 ? 'PASS' : 'FAIL', `${admins} admin user(s) exist (create one: npm run create-admin)`)
      await prisma.$disconnect()
    } catch (e) { out('FAIL', `database check failed: ${(e as Error).message.split('\n').map((l) => l.trim()).filter(Boolean).pop()}`) }
  }
}

const target = process.argv[2]
await (target ? checkLive(target) : checkEnv())
console.log(failed ? `\n${failed} problem(s) to fix before deploying.` : '\nReady.')
process.exit(failed ? 1 : 0)
