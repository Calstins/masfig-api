# MASFIG — go-live runbook

Two projects: `masfig-api` (Node + Prisma + Neon, runs on Vercel) and `client` (Next.js static export, stays on Cloudflare Pages).
The only change on Cloudflare is the `NEXT_PUBLIC_API_URL` variable (plus the optional ones below). DNS stays where it is.

## 0. Deployment checklist (do in this order)

**Cloudflare Pages — `client`** (Workers & Pages > Create > Pages > connect the Git repo or upload)
| Setting | Value |
| --- | --- |
| Framework preset | Next.js (Static HTML Export) |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `out` |
| Root directory | the `client` folder |
| Node version | 22 (already pinned by `.node-version`) |
| Variables (Production) | `NEXT_PUBLIC_API_URL` = your Vercel API URL; `NEXT_PUBLIC_SITE_URL` = `https://masfig.com` |

**Vercel — `masfig-api`** (Add New > Project, root directory `masfig-api`, Framework: Other; `vercel.json` sets the rest)
Variables: everything in `.env.example`. Required: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `IP_HASH_SALT`, `CORS_ORIGINS`, `PUBLIC_SITE_URL`, `STORAGE_DRIVER=r2` and the five `R2_*` values.

**Order**
1. Neon: create the database, then locally `npm run db:deploy`.
2. Vercel: deploy the API. Leave `CF_PAGES_DEPLOY_HOOK_URL` empty for now.
3. `npm run preflight -- https://YOUR-API.vercel.app` must end with "Ready." (`npm run preflight` with no address checks your local `.env`.)
4. `npm run create-admin`, then `npm run seed:catalog` (section D2).
5. Cloudflare: set the two variables and deploy. If the API is down the build fails on purpose and the old site stays live.
6. Create the deploy hook, add it to Vercel as `CF_PAGES_DEPLOY_HOOK_URL`, redeploy the API.
7. Log in at masfig.com/admin: Settings, Tracking, and the Facebook feed. Then follow the tracking guide.

## A. Database (Neon)
1. Create a Neon project. Copy the **pooled** string (host has `-pooler`) and the **direct** string.
2. On your computer: `cd masfig-api && cp .env.example .env`, fill `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).
3. `pnpm install` (or `npm install`) then `npx prisma migrate deploy`.
   The first migration was hand-written (the sandbox could not download Prisma's schema engine). Before trusting it run
   `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`
   against a scratch database; exit code 0 means the migration matches the schema exactly.

## B. Media (Cloudflare R2)
Create a bucket, enable a public domain (e.g. `media.masfig.com`), create an API token with Object Read & Write on that bucket.
Fill the `R2_*` variables. Without them uploads return 503 in production (by design).

## C. API on Vercel
1. Import `masfig-api` as a Vercel project. Framework: Other. Add every variable from `.env.example`
   (`JWT_SECRET` ≥ 32 random chars, `IP_HASH_SALT` random, `CORS_ORIGINS` = your site origins, `CF_PAGES_DEPLOY_HOOK_URL`).
2. Deploy, then check `https://<api>/api/health` returns `{"ok":true}`.
3. Create the first admin (never a default password):
   `ADMIN_PASSWORD='<12+ chars>' npx tsx scripts/create-admin.ts --email you@domain --name "Your Name"`
4. Import the existing site content from the old Laravel SQLite file (dry run first):
   `npm run db:import-sqlite -- --sqlite ../server/database/database.sqlite --media-dir ../server/storage/app/public` then add `--apply`.
   Imported users must change their password on first sign-in. Old Laravel tokens do not carry over (everyone signs in again).

## D. Site on Cloudflare Pages
1. Project > Settings > Variables: set `NEXT_PUBLIC_API_URL` (your API URL), `NEXT_PUBLIC_SITE_URL=https://masfig.com`.
   Tracking IDs (Analytics, Meta Pixel, Search Console codes) are entered in Admin > Tracking, not here. **Do not** set `ALLOW_STATIC_FALLBACK`.
2. Settings > Builds > Deploy hooks: create one, paste its URL into Vercel as `CF_PAGES_DEPLOY_HOOK_URL`.
3. Redeploy. If the API is unreachable the build fails on purpose and the live site stays as it was.
4. Check: `/`, `/products/`, `/blog/`, `/contact/`, `/sitemap.xml`, `/robots.txt`, view-source on the home page.
5. Submit `https://masfig.com/sitemap.xml` in Google Search Console (needs MASFIG's Google account or a delegated user).

## D2. Seed the catalogue, hero slides, SEO guides and theme (once, after the API and R2 work)

Builds everything from the supplied PDF catalogue: 10 categories, ~330 products (quote only, no prices, no invented specs), 10 hero slides (one per category, using a product photo), 25 blog guides (10 earlier + 15 SEO guides, cover images taken from the catalogue photos), missing contact details (third phone, both addresses, social links; existing values are never overwritten) and the red/white theme. Price display is set OFF (request a quote). The four old categories (commercial-kitchen, catering-systems, hotel-hospitality, advanced-packaging) are removed once empty. Safe to re-run: records are matched by slug and updated; images are only uploaded when a record has none.

1. In the API's `.env`, point at Neon and R2 as usual. Leave `CF_PAGES_DEPLOY_HOOK_URL` empty while seeding (the script triggers one rebuild at the end if it is set).
2. Start the API (`npm run dev`), then in a second terminal (PowerShell):
   `$env:SEED_ADMIN_EMAIL="you@masfig.com"; $env:SEED_ADMIN_PASSWORD="your-admin-password"; npm run seed:catalog`
   Uploads ~440 photos, so allow a few minutes against R2.
3. Check Admin > Categories / Products / Hero slides / Blog and edit copy as needed. Then put `CF_PAGES_DEPLOY_HOOK_URL` back and trigger one Cloudflare build (Deployments > Retry, or save any item in the admin).

Everything is editable in the admin afterwards. Product pages say "specifications confirmed on quotation" because the catalogue gives names, sizes and photos but no specs or prices. Add real specs per product in Admin > Products when you have them.

**URL change:** the product section is now `/products/` (was `/equipment/`). `client/public/_redirects` sends the old `/equipment/...` addresses to the new ones with a 301.

**Prices:** Admin > Settings > "Show prices" (off by default). While off, the API never returns a price, so none can leak into the static site. Turn it on only for products whose price mode is "Show price" and have a price set.

## D3. Facebook feed (optional, needs a Page access token)
The home page shows the latest four posts of your Facebook Page, videos as video.
1. In Facebook for Developers create an app, then generate a long-lived **Page access token** for the MASFIG Page with `pages_read_engagement` and `pages_show_list` (Page Public Content Access may be required for reading public posts).
2. Admin > Facebook feed: enter the numeric Page ID, the Page URL and the token, then press Test.
3. The token is stored server-side only and is never returned by the API or put in the static site. The API caches the feed for five minutes and falls back to the last good copy if Facebook is down.
4. This could not be tested against the real Graph API here (needs your Page and token); it is covered by tests with a mocked response only. Test it once after deploy.
5. The site loads the feed in the browser from the API, so set the API's `CORS_ORIGINS` to include `https://masfig.com`.

## E. Rollback
Cloudflare Pages keeps previous deployments: Deployments > pick the last good one > Rollback. Point `NEXT_PUBLIC_API_URL` back at the old Laravel API only if you redeploy that old build.

## F. Before any claim goes on the site (Admin > Settings > "Show unverified claims" stays OFF until all are proven)
500+ clients, 2,500+ installations, 15+ industries, 20+ years, 98% uptime, "100% damage protection", Lagos 1–2 day and nationwide 3–5 day delivery,
"100% certified equipment", "24/7 support", case-study results and testimonials. Also needed from MASFIG: full street address (must match Google Business Profile),
email, opening hours, real product list with photos and specs, and prices only if they want them public.

## G. Known limits
- Uploads are capped at 4 MB per file (Vercel request limit). The admin media page shrinks big photos in the browser first.
- Publishing several items in quick succession can queue several site builds; each is harmless, the last one wins.
- Privacy and Terms are draft templates: have them reviewed before launch. Delivery & installation wording must be confirmed by MASFIG.
- The API keeps a 20-second cache of the public catalogue. On Vercel each running instance has its own, so a change can take up to 20 seconds to appear everywhere.
- WhatsApp on the site is a click-to-chat link only. No automation is attached.
