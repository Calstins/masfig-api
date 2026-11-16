/**
 * Creates or resets an ADMIN account. There is deliberately no default password.
 *
 *   ADMIN_PASSWORD='a-long-unique-password' npm run create-admin -- --email you@masfig.com --name "Your Name"
 */
import bcrypt from 'bcryptjs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string', default: 'Admin' } } })

async function main() {
  const password = process.env.ADMIN_PASSWORD
  if (!values.email) throw new Error('--email is required')
  if (!password || password.length < 12) throw new Error('Set ADMIN_PASSWORD (at least 12 characters) in the environment')
  const { prisma } = await import('../src/db.js')
  const email = values.email.toLowerCase()
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.upsert({
    where: { email },
    create: { name: values.name!, email, passwordHash, role: 'ADMIN', active: true },
    update: { passwordHash, role: 'ADMIN', active: true, mustChangePassword: false },
  })
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  console.log(`Admin ready: ${user.email} (id ${user.id}). Existing sessions were revoked.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
