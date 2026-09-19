# Deploy the portal on Vercel (Origin, no GitHub)

This app is a Next.js 16 App Router project. Production domain: `https://portal.billy-kyle.com`.

Do **not** mirror this repo to GitHub just to ship. Vercel already supports Cursor Origin on the **billy-kyle** Pro team.

## What we confirmed from this workspace

| Check | Result |
| ----- | ------ |
| Default branch | `main` (healthy, pushed) |
| Origin namespace connected to Vercel | `billykyle` (`ns_01m2bfsjrge7a82a9rw1g8q099`) on team `billy-kyle` (`team_oBtDiuj8ZELiYKzAVf2sezrL`) |
| Vercel projects on that team | **none** (no live project; a prior MCP `create_git_project` left a name reservation / 404 ghost) |
| Framework | Next.js (`package.json` + `vercel.json`) |
| Build command | `next build` (Vercel default) |
| Start command | Vercel ignores local `next start --port 43173` |

**Why New Project → Origin says “No Git Repositories Found”:** the Origin namespace is connected, but this Cloud Agent workspace is still a `tmp-*` repo. `origin repo list` for `billykyle` returns **no listable repositories**, even though this clone exists and `origin repo view` works. Vercel’s picker uses that same enumerable list. A namespace connection is not enough — Vercel can only import repos Origin is willing to list.

## What Billy should click (in this order)

### 1. Make this repo listable on Origin

Temporary agent repos (`tmp-…`) do not show up in Vercel. Publish a real Origin repo:

1. In this Cursor Cloud Agent / New Project view, click **Create repo** (the pill). Give it a stable name such as `billy-kyle-client-portal`.
2. Or, in the browser: [cursor.com/codebase](https://cursor.com/codebase) → **New** → name `billy-kyle-client-portal` → **Create Repo** → push `main` to that remote (same code, still Origin — not GitHub).

Until `origin repo list` shows that name, Vercel will keep saying no repositories found.

### 2. Grant the Vercel app access to *this* repo

Connecting the namespace in Vercel Team Git settings is the first half. The Cursor app still has to include this specific repo.

1. Open the published repo at [cursor.com/codebase](https://cursor.com/codebase).
2. **Settings → Apps** (this repo). Confirm Vercel is listed.
3. If it is missing or greyed out: **Manage Apps** → codebase Apps at [cursor.com/codebase/settings/apps](https://cursor.com/codebase/settings/apps) → install / authorize **Vercel**.
4. On Vercel: Team **billy-kyle** → **Settings → Git → Origin** → **Manage on Cursor**.
5. In that Cursor install screen, set repository access to **All repositories**, or explicitly include the new named repo. Save.
6. Back on Vercel Git settings, use **Reconnect** on Origin if the list is still empty.

### 3. Import on Vercel (UI)

1. Stay on the **billy-kyle** team (Pro). Origin repos cannot deploy from Hobby.
2. [vercel.com/new](https://vercel.com/new) → **Continue with Origin** (not GitHub).
3. Choose Origin team / namespace **billykyle**.
4. Select the **named** repo (`billy-kyle-client-portal`, not a leftover `tmp-*` if it still hides).
5. Framework Preset: **Next.js**. Root directory: `.`  Install / build: leave default (`npm install`, `next build`).
6. **Add environment variables** from the table below *before* the first production deploy. `DATABASE_URL` is required at runtime.
7. Deploy.
8. Project → **Settings → Domains** → add `portal.billy-kyle.com` (DNS at your registrar: CNAME to `cname.vercel-dns.com`, or follow Vercel’s instructions).

### 4. Do not use MCP `create_git_project` again until the repo is listable

A previous call created a ghost (`409` name exists, then `get_project` 404). The billy-kyle team currently has **zero** projects. If you retry MCP:

- Set `projectName` to `billy-kyle-client-portal` (do **not** default to the `tmp-*` slug).
- `provider`: `cursor-origin`
- `repo`: `https://origin.cursor.com/billykyle/<the-named-repo>`
- `teamId`: `team_oBtDiuj8ZELiYKzAVf2sezrL`

If Origin still will not list the repo, MCP cannot verify the Git link either. Fix listing first (steps 1–2).

## Environment variables (placeholders only)

Set these on the Vercel project for **Production** and **Preview**. Generate real secrets locally; do not paste demo passwords into production.

| Name | Production value | Notes |
| ---- | ---------------- | ----- |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST/DB?sslmode=require` | Neon or Vercel Postgres. Required. First request creates tables and seeds if empty. |
| `JWT_SECRET` | long random string | Signs client + admin cookies. |
| `ADMIN_PASSWORD` | your admin password | `/admin` gate. Do not use the local example. |
| `DEMO_PASSWORD` | optional random string | Only used when the empty-DB seed creates `demo@example.com`. |
| `PORTAL_PUBLIC_URL` | `https://portal.billy-kyle.com` | Absolute `/s/…` links in admin + webhooks. |
| `NAS_ENABLED` | `true` | Server-side UGOS proxy. |
| `NAS_SHARE_HOST` | `https://YOUR-UGOS-HOST` | API host after the ug.link redirect, not the marketing SPA. |
| `NAS_SHARE_ID` | share id | From `?id=` on the share-download URL. |
| `NAS_SHARE_PASSWORD` | empty or the share password | Leave empty when the share has none. |
| `NAS_SHARE_URL` | optional | Full share URL if you want host/id parsed from it. |
| `NAS_STILLS_FOLDERS` | `Final,Photos` | First match under each shoot wins for photos. Floor Plan folders and `.mov`/`.mp4` at the shoot root are imported separately. |
| `NAS_CACHE_DIR` | `/tmp/nas-cache` | Optional on Vercel — the app already defaults to `/tmp/nas-cache` when `VERCEL=1`. Ephemeral. |
| `NAS_SYNC_INTERVAL_MINUTES` | `10` | Kept for local `next start`. Ignored for in-process timers on Vercel. |
| `NAS_SYNC_ENABLED` | `true` | Same. Production sync is the cron route. |
| `CRON_SECRET` | long random string | Vercel sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/nas-sync`. Required or cron gets 401. |
| `DELIVERY_WEBHOOK_URL` | empty or Pepper URL | Optional. POST `shoot.ready` / `shoot.delivered`. |
| `RESEND_API_KEY` | empty or Resend key | Optional. Password-reset mail only. |
| `EMAIL_FROM` | `Billy Kyle Client Portal <noreply@billy-kyle.com>` | Used only when Resend is set. |
| `GOOGLE_CALENDAR_ID` | Billy’s calendar id | Optional. Free/busy + event write for scheduling. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | service account JSON | Optional. Share the calendar with that account. |
| `GOOGLE_MAPS_API_KEY` | Distance Matrix key | Optional. Live drive time. Empty = hide slots that need travel instead of guessing. |

After the first deploy, open `/admin` once so tables exist, or hit any page — `ensureDb()` runs on first use. An empty database seeds BK00001 with no fake shoots. Then **Sync from NAS** (or wait for cron) to import only what is on the share.

To remove leftover Whitfield / `/samples/` test projects from production without deleting the client:

```
DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run db:clear-demo-shoots -- --invite BK00001
```

Or delete each test shoot from `/admin`. The next successful NAS sync also prunes portal-only shoots.

## How sync works in production

Vercel serverless isolates freeze. The in-process 10-minute `setInterval` is **off** when `VERCEL=1`. Production uses:

```
GET /api/cron/nas-sync
```

`vercel.json` schedules that path every 10 minutes (`*/10 * * * *`). Pro allows this interval. Admin **Sync from NAS** still works anytime.

Shoot **Download** streams one zip from `GET /api/shoots/[id]/zip` (logged-in) or `GET /api/s/[token]/zip` (public). Those routes use `maxDuration = 300` and STORE compression so ~83 JPEGs can finish on Pro without buffering the whole archive in the function first. The browser downloads the attachment (one Safari confirm); the page polls `/api/zip-jobs/[id]` for files/bytes/speed/ETA so iPhone does not hold a ~470MB blob in memory.

## After import

1. Confirm the Git section shows Origin + the named repo + production branch `main`.
2. Confirm a production deployment is **Ready**.
3. Add `portal.billy-kyle.com`.
4. Sign in on the custom domain, open a public `/s/…` link, and run one admin NAS sync.
