import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// Rebuilds the test schema from the real migration files before the suite runs.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:54329/masfig_test'
  if (!/test/i.test(new URL(url).pathname)) throw new Error('Refusing to reset a database whose name does not contain "test"')
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  const dir = join(process.cwd(), 'prisma', 'migrations')
  for (const name of readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort()) {
    await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'))
  }
  await client.end()
}
