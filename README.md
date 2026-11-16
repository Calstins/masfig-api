# masfig-api

Node.js + TypeScript API for masfig.com. Express on Vercel, Prisma 7 on Neon Postgres, media in Cloudflare R2.
Replaces the Laravel backend; the legacy routes keep the same paths and response shapes, so the existing client works by changing `NEXT_PUBLIC_API_URL`.

## Roles
| | ADMIN | EDITOR |
|---|---|---|
| Create/edit/publish products, categories, FAQs, posts | yes | yes |
| Delete products, categories, posts | yes | no |
| Upload media / delete own | yes | yes |
| Delete any media | yes | no |
| Edit site sections and theme | yes | no |
| View and handle enquiries | yes | yes |
| Manage users, rebuild site, audit log | yes | no |

Every route checks the role on the server. The role is re-read from the database on each request, so demoting or deactivating a user takes effect immediately.

## Setup
```bash
npm install
cp .env.example .env            # fill in Neon, R2, secrets
npm run db:deploy               # applies prisma/migrations to Neon (uses DIRECT_URL)
ADMIN_PASSWORD='a-long-unique-password' npm run create-admin -- --email you@masfig.com --name "Your Name"
npm run dev
```

### Migrating the existing Laravel data
```bash
# 1. dry run: reports what would happen, writes nothing
npm run db:import-sqlite -- --sqlite ../server/database/database.sqlite --media-dir ../server/storage/app/public
# 2. import (idempotent): users, sections, theme, media -> R2
npm run db:import-sqlite -- --sqlite ../server/database/database.sqlite --media-dir ../server/storage/app/public --apply
```
Migrated accounts are flagged to change their password at first login (the old seeder shipped a known default password). Laravel API tokens are not migrated; everyone signs in again.

## Deploy (Vercel)
1. Import the repo in Vercel; framework preset "Other". Build command is in `vercel.json` (`prisma generate`).
2. Add the environment variables from `.env.example`. Use the **pooled** Neon string for `DATABASE_URL`.
3. Run `npm run db:deploy` once from your machine (or CI) against Neon with `DIRECT_URL` set.
4. Point the client's `NEXT_PUBLIC_API_URL` at the Vercel URL and rebuild the client. No DNS change is required.

Notes:
- Vercel limits request bodies to ~4.5 MB, so uploads are capped at 4 MB per image. The admin media page shrinks large images in the browser before upload.
- Publishing, unpublishing, deleting published content, and editing sections/theme call the Cloudflare Pages deploy hook (`CF_PAGES_DEPLOY_HOOK_URL`) so the static site rebuilds. Responses include `rebuild: "triggered" | "failed" | "not_configured"`. Rapid edits can queue several builds.

## About the first migration
`prisma/migrations/20261111000000_init/migration.sql` was written by hand because the Prisma schema engine could not be downloaded in the sandbox where this was built. It was applied to a real PostgreSQL 16 database and the full test suite runs against it. Before your first deploy, confirm it matches `schema.prisma` exactly. This should report no difference. (The exact flags differ between Prisma versions and I could not run this command in the build sandbox; check `npx prisma migrate diff --help` if it errors.)
```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```
(Run it against a database that already has the migration applied.) If it reports differences, run `npx prisma migrate dev --name sync` and commit the generated migration.

## Tests
`npm test` runs against a real PostgreSQL database (default `postgresql://postgres@localhost:54329/masfig_test`; override with `TEST_DATABASE_URL`). The setup drops and rebuilds the `public` schema of that database, and refuses to run unless the database name contains "test".

## Endpoints
Legacy (unchanged paths): `/api/auth/{login,logout,me}`, `/api/sections[/:slug]`, `/api/theme`, `/api/media[/:id]`.
New public: `/api/catalog`, `/api/categories[/:slug]`, `/api/products[/:slug]`, `/api/posts[/:slug]`, `POST /api/enquiries`.
New admin (`/api/admin/...`): `categories`, `products`, `posts` (CRUD + `/:id/publish|unpublish`), `enquiries`, `users`, `rebuild`, `audit-log`; `POST /api/auth/change-password`.
