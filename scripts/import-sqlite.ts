/**
 * One-off, repeatable import from the Laravel SQLite database into Postgres (Neon).
 *
 *   npm run db:import-sqlite -- --sqlite ../server/database/database.sqlite --media-dir ../server/storage/app/public
 *   npm run db:import-sqlite -- ... --apply        # without --apply nothing is written
 *
 * - Users: upserted by email as ADMIN. Laravel "$2y$" bcrypt hashes are converted to "$2b$" (same algorithm).
 * - Sections / theme: upserted (re-running overwrites with the SQLite copy).
 * - Media: files found under --media-dir are processed and uploaded to the configured storage (R2);
 *   rows whose file is missing are SKIPPED and reported (never recorded as broken rows).
 *   Old media URLs inside section JSON are rewritten to the new URLs.
 * - Sanctum tokens are not migrated: everyone signs in again after cutover.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    sqlite: { type: 'string', default: '../server/database/database.sqlite' },
    'media-dir': { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
})

const VALID = ['settings', 'hero', 'equipment-grid', 'stats', 'showcase', 'projects', 'delivery', 'footer']

async function main() {
  const { prisma } = await import('../src/db.js')
  const { getStorage } = await import('../src/lib/storage.js')
  const { storeImage } = await import('../src/lib/images.js')

  const path = resolve(values.sqlite!)
  if (!existsSync(path)) throw new Error(`SQLite file not found: ${path}`)
  const src = new DatabaseSync(path, { readOnly: true })
  const apply = !!values.apply
  console.log(`${apply ? 'APPLYING' : 'DRY RUN (no changes will be written)'} — source: ${path}`)

  const users = src.prepare('SELECT name, email, password FROM users').all() as { name: string; email: string; password: string }[]
  const sections = src.prepare('SELECT slug, data FROM sections').all() as { slug: string; data: string }[]
  const themes = src.prepare('SELECT data FROM site_themes ORDER BY id LIMIT 1').all() as { data: string }[]
  const media = src.prepare('SELECT filename, path, url, mime_type FROM media ORDER BY id').all() as { filename: string; path: string; url: string; mime_type: string | null }[]

  const report: Record<string, unknown> = {
    users: users.length,
    sections: sections.filter((s) => VALID.includes(s.slug)).length,
    sectionsIgnored: sections.filter((s) => !VALID.includes(s.slug)).map((s) => s.slug),
    theme: themes.length,
    mediaRows: media.length,
  }

  // ---- media: upload what exists, collect URL rewrites
  const rewrites = new Map<string, string>()
  const mediaSkipped: string[] = []
  const mediaDone: string[] = []
  for (const m of media) {
    const file = values['media-dir'] ? join(resolve(values['media-dir']), m.path) : undefined
    if (!file || !existsSync(file)) {
      mediaSkipped.push(`${m.filename} (${m.path}) — file not found`)
      continue
    }
    if (!apply) {
      mediaDone.push(`${m.filename} (would upload)`)
      continue
    }
    const buffer = readFileSync(file)
    // Idempotent: a file already imported (same name and byte size) is reused, not uploaded again.
    const already = await prisma.media.findFirst({ where: { filename: m.filename.slice(0, 200), size: buffer.length } })
    if (already) {
      rewrites.set(m.url, already.url)
      mediaDone.push(`${m.filename} -> ${already.url} (already imported)`)
      continue
    }
    const img = await storeImage(getStorage(), { buffer, originalname: m.filename })
    await prisma.media.create({
      data: { filename: img.filename, key: img.key, url: img.url, mimeType: img.mimeType, size: img.size, width: img.width, height: img.height, variants: img.variants },
    })
    rewrites.set(m.url, img.url)
    mediaDone.push(`${m.filename} -> ${img.url}`)
  }
  report.mediaMigrated = mediaDone
  report.mediaSkipped = mediaSkipped

  const rewrite = (json: string) => {
    let out = json
    for (const [from, to] of rewrites) out = out.split(from).join(to)
    return out
  }

  if (apply) {
    for (const u of users) {
      const hash = u.password.replace(/^\$2y\$/, '$2b$')
      await prisma.user.upsert({
        where: { email: u.email.toLowerCase() },
        // Migrated accounts must choose a new password at first login (the old seeder shipped a known default).
        create: { name: u.name, email: u.email.toLowerCase(), passwordHash: hash, role: 'ADMIN', mustChangePassword: true },
        update: { name: u.name, passwordHash: hash, role: 'ADMIN' },
      })
    }
    for (const s of sections.filter((x) => VALID.includes(x.slug))) {
      const data = JSON.parse(rewrite(s.data))
      await prisma.section.upsert({ where: { slug: s.slug }, create: { slug: s.slug, data }, update: { data } })
    }
    if (themes[0]) {
      const data = JSON.parse(themes[0].data)
      const existing = await prisma.siteTheme.findFirst({ orderBy: { id: 'asc' } })
      if (existing) await prisma.siteTheme.update({ where: { id: existing.id }, data: { data } })
      else await prisma.siteTheme.create({ data: { data } })
    }

    // ---- verification: counts and byte-identical section JSON (after URL rewrites)
    const checks: string[] = []
    const wantSections = sections.filter((x) => VALID.includes(x.slug))
    const gotSections = await prisma.section.count({ where: { slug: { in: VALID } } })
    checks.push(`sections: source ${wantSections.length}, target ${gotSections}`)
    for (const s of wantSections) {
      const row = await prisma.section.findUniqueOrThrow({ where: { slug: s.slug } })
      // JSONB does not preserve key order, so compare structurally.
      const same = isDeepStrictEqual(row.data, JSON.parse(rewrite(s.data)))
      checks.push(`section ${s.slug}: ${same ? 'identical' : 'MISMATCH'}`)
      if (!same) process.exitCode = 1
    }
    for (const u of users) {
      const row = await prisma.user.findUnique({ where: { email: u.email.toLowerCase() } })
      checks.push(`user ${u.email}: ${row ? 'present (ADMIN)' : 'MISSING'}`)
      if (!row) process.exitCode = 1
    }
    if (gotSections !== wantSections.length) process.exitCode = 1
    report.verification = checks
  }

  console.log(JSON.stringify(report, null, 2))
  if (!apply) console.log('\nNothing was written. Re-run with --apply to import.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Import failed:', err.message)
  process.exit(1)
})
