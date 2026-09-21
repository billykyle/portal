# Billy Kyle Client Portal

Private, phone-first file delivery for Atmos Imagery / Billy Kyle. Clients redeem a permanent invite code, create their own login, and open every shoot attached to that code.

Black and white only. No favorites. Every shoot has a stable public link.

## What it does

1. Splash — enter invite code (`BK` + 5 digits).
2. Create account — email + password, or sign in.
3. Forgot password — email reset link (or an on-screen link when email is not configured).
4. Hub — after sign-in, exactly two choices: **My Content** and **Scheduling**.
5. My Content — the existing library: every shoot for that invite code, labeled date + address, newest first.
6. Shoot — in-app photo viewer, inline video, floor plans, **Download** (one streamed zip — Safari/mobile confirms once — with a progress bar, speed, and time remaining) and per-file **Download** on each tile. If a shoot has more than one media type, the main Download button opens a picker (Everything / Photos / Floor plans / Video). A photos-only shoot still starts the zip in one tap. The zip is named `{date} - {address}.zip`.
7. Scheduling — two steps. **Step 1** (`/scheduling`): expand Real Estate, Construction, or Podcast. Real Estate and Construction stay multi-select; Podcast is one of **1 episode** or **2 episodes**. Type a single shoot address (Places Autocomplete fills the same field — not split street/city/state/ZIP). Availability prefetch starts once the address and at least one service are valid. **Step 2** (`/scheduling/times`): available times only after that address is set; last good slots stay on screen while times refresh. Slot length is the **sum** of selected service minutes, never longest-only. Upcoming bookings show every selected option as `Industry · Option` (for example `Real Estate · Photography` or `Podcast · 1 episode`). Travel hard-block is live drive time only (Google Maps when `GOOGLE_MAPS_API_KEY` is set); there is no extra pad. Google Calendar is source of truth when wired: work `billy@atmosimagery.com` **and** personal `bkyle015@gmail.com` — a time is busy if either calendar is busy. US Holidays is not used. Geography is never guessed. No prices in this flow. After **Book shoot**, if `RESEND_API_KEY` is set, the portal sends **two** Resend emails (no CC/BCC): a client confirmation to the session email, and a `New shoot: …` alert to `billy@billyhere.com` (or `BOOKING_NOTIFY_EMAIL`). A Calendar or email failure does not undo the saved shoot, but the confirmation page says so instead of looking fully successful. Billy also gets `Portal booking sync issue` (or a `PORTAL_BOOKING_SYNC_ALERT` log plus an admin `sync_issue` flag if that alert cannot send). Calendar writes use a deterministic event id so retries do not double-create. A Workspace Admin must allow external calendar edit sharing (or domain-wide delegation) for live Calendar create. Pepper is not required.
8. Public link — every shoot has an unguessable `/s/[token]` URL. Copy it from the logged-in shoot page or from admin. Anyone with the link can view and download without signing in. There is no publish toggle.
9. Dropbox — collapsed control with the Dropbox view link (logged-in shoot page only).
10. Admin — Billy syncs the NAS share (also automatic every 10 minutes while the app is running), edits or deletes a client, removes a teammate login or a shoot, marks a shoot delivered (stub for Pepper), or mints a BK code by hand. Tap a shoot row to open the same shoot page clients see. Portal files match the NAS tree — no placeholder media. **Bookings** lists every scheduled shoot.

Invite codes are the client primary key. They start at **BK00001** and increment. One code is permanent and multi-use: teammates each create their own user and share the same shoot library.

## Intended delivery flow

Billy’s end-to-end path (this is the product, not a future maybe):

1. Drop stills for a client into **Client Deliverables / {client} / {date} - {address} / Final** (or `Photos`). Put floor plans in **Floor Plan** (nested folders are fine) and video as `.mp4`/`.mov` on that shoot folder.
2. Sync (`npm run nas:sync` or **Sync from NAS** in admin). The portal upserts the client, creates the shoot + public link, and imports JPGs.
3. A delivery email goes out with that portal link.

This pass implements steps 1–2. Step 3 is a **hook**, not Gmail:

- After sync, each newly ready shoot (new folder, or first stills on an empty shoot) POSTs `shoot.ready` to `DELIVERY_WEBHOOK_URL` when that env var is set.
- Admin **Mark delivered** records `delivered_at` and POSTs `shoot.delivered` to the same URL. It does **not** send mail.
- Pepper (or any automation) should send the email later: “Your photos are ready” + `shoot.publicUrl` (and invite code if they do not have a login yet).

Webhook body:

```json
{
  "event": "shoot.ready",
  "client": {
    "id": "…",
    "displayName": "Sam Lepore",
    "inviteCode": "BK00004",
    "primaryEmail": "sam@example.com"
  },
  "shoot": {
    "id": "…",
    "shotDate": "2026-09-04",
    "address": "12 Wood View Drive",
    "publicUrl": "http://127.0.0.1:43173/s/…",
    "fileCount": 83
  }
}
```

`event` is `shoot.ready` or `shoot.delivered`. Set `PORTAL_PUBLIC_URL` so `publicUrl` is an absolute link. Leave `DELIVERY_WEBHOOK_URL` empty to skip the POST. Resend (`RESEND_API_KEY`) sends password-reset and booking-confirmation mail. It is optional and unrelated to delivery / Pepper.

## Run locally

You need Node 20+ and Postgres 16.

```bash
cp .env.example .env.local
# edit secrets if you want
docker compose up -d   # or any Postgres that matches DATABASE_URL
npm install
npm run db:setup       # creates tables and seeds BK00001 when empty
npm run nas:sync       # walk Client Deliverables and upsert clients, shoots, stills
npm run dev            # http://127.0.0.1:43173
```

If Postgres is already running on this machine:

```
DATABASE_URL=postgresql://portal:portal@127.0.0.1:5432/portal
```

The first server boot also creates tables and seeds an empty database.

### Demo login

| Role   | How to get in |
| ------ | ------------- |
| Demo client | Invite `BK00001`, or sign in as `demo@example.com` / `portal1234`. Empty DBs seed this client with **no shoots**. |
| Sam Lepore | Invite minted on first NAS sync, or sign in as `sam@example.com` / `portal1234` if that login was created during the first import |
| Admin  | Production: `https://admin.billy-kyle.com` (`ADMIN_PASSWORD`, example: `atmos-admin`). Local: `/admin` on the same `next dev` origin. `https://portal.billy-kyle.com/admin` redirects to the admin host. |

Shoots only exist when they exist on the NAS share. Sam Lepore’s 12 Wood View Drive stills are proxied from `Final/`. Each shoot has a public `/s/…` link. Copy it from the logged-in shoot page (or admin). No login is required to open that URL.

## Env vars

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Postgres connection string. Neon or Vercel Postgres work as-is. |
| `JWT_SECRET` | Signs client and admin cookies. Use a long random string in production. |
| `ADMIN_PASSWORD` | Shared password for the Billy-only admin app. |
| `DEMO_PASSWORD` | Password for the seeded `demo@example.com` user. |
| `NAS_ENABLED` | `true` serves NAS-backed media through the server proxy (`/api/media/[id]`). Required for attach and sync. |
| `NAS_SHARE_HOST` | UGOS share host after the ug.link redirect, e.g. `https://10128873.us15.ug.link`. |
| `NAS_SHARE_ID` | Share id from the `?id=` query on the share-download URL. |
| `NAS_SHARE_PASSWORD` | Optional share password. Leave empty when the share has none. |
| `NAS_SHARE_URL` | Optional full share URL. Used to parse `id` and discover the real host if `NAS_SHARE_HOST` is unset. |
| `NAS_STILLS_FOLDERS` | Folder names to look under each shoot for stills. Default: `Final,Photos` (first match wins). Floor plans and video are picked up separately (see folder layout). |
| `NAS_CACHE_DIR` | Local cache for proxied thumbs and full files. Default: `.nas-cache` locally, `/tmp/nas-cache` on Vercel. |
| `NAS_SYNC_INTERVAL_MINUTES` | How often a long-running Node process walks the share. Default `10`. `0` disables the timer. Ignored on Vercel. |
| `NAS_SYNC_ENABLED` | `false` turns off the in-process timer. Manual sync is unchanged. |
| `CRON_SECRET` | Bearer token for `GET /api/cron/nas-sync`. Required on Vercel. |
| `PORTAL_PUBLIC_URL` | Absolute origin for public shoot `/s/…` links in webhooks and admin copy links. Production: `https://portal.billy-kyle.com`. Not the admin entry. |
| `ADMIN_PUBLIC_URL` | Absolute origin for the Billy-only admin app. Production: `https://admin.billy-kyle.com`. Unset locally so `/admin` stays on `next dev`. |
| `DELIVERY_WEBHOOK_URL` | Optional. POST `shoot.ready` / `shoot.delivered` JSON for Pepper. Empty = no POST. |
| `RESEND_API_KEY` | Optional. Sends password-reset and booking-confirmation email. Not delivery mail. |
| `EMAIL_FROM` | From address when Resend is set. Default: `Billy Kyle <billy@billyhere.com>`. |
| `BOOKING_NOTIFY_EMAIL` | Optional. Second booking email (Billy's alert). Default: `billy@billyhere.com`. Not CC/BCC. |
| `GOOGLE_CALENDAR_IDS` | Optional. Comma-separated availability calendars. Locked: work `billy@atmosimagery.com` + personal `bkyle015@gmail.com`. Free/busy unions both — a slot is busy if either is busy. Do not include US Holidays. Bookings write to the first ID. Share both with the service-account email. |
| `GOOGLE_CALENDAR_ID` | Optional fallback if `GOOGLE_CALENDAR_IDS` is empty. Same Calendar auth. |
| `GCP_PROJECT_ID` | Optional. GCP project id (`glassy-polymer-509203-r1`). |
| `GCP_PROJECT_NUMBER` | Production WIF. Numeric project number from IAM & Admin → Settings. |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | Production WIF. Pool id Flynn creates (example: `vercel`). |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Production WIF. OIDC provider id (example: `vercel`). |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Production WIF. Impersonated SA: `portal-scheduling@glassy-polymer-509203-r1.iam.gserviceaccount.com`. Alias: `GOOGLE_SERVICE_ACCOUNT_EMAIL`. |
| `GCP_AUDIENCE` | Optional. Leave empty for Team-issuer + GCP Allowed audiences (`https://vercel.com/billy-kyle`). Set to the IAM provider https URL only if the WIF provider uses GCP Default audience. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Local/dev fallback only. Downloadable SA JSON keys are blocked on this GCP project. Or `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`. |
| `GOOGLE_MAPS_API_KEY` | Optional, server-only. Distance Matrix (travel) plus Places Autocomplete / Place Details / Address Validation (book-form suggestions). Enable those APIs on the same Google Cloud key. Empty = no invented suggestions or drive times; the address field shows a clear message. Separate from Calendar WIF. |

Production Calendar auth is Vercel OIDC + GCP Workload Identity Federation (no downloadable SA key). Pool setup and env table: [docs/google-calendar.md](docs/google-calendar.md).

Scheduling rules live in `src/lib/scheduling/rules.ts`: address first (times only on `/scheduling/times` after a street address), Calendar as source of truth when wired (work + personal; busy if either is busy; no US Holidays), travel = live drive time only (no pad), never fake geography. Address suggestions come from Places Autocomplete via the same `GOOGLE_MAPS_API_KEY` — the book form never invents streets. The locked starter catalog in `src/lib/scheduling/services.ts` is Real Estate (Photography 45, Video 30, Aerial Photos 15, Zillow 360 15), Construction (Photography 45, Video 45), and Podcast (1 episode 60, 2 episodes 105) — industry accordions; Podcast is single-select. Slot length is the **sum** of selected minutes (never longest-only). Offered start times are 9:00–18:00 Eastern on 15-minute steps; a 6:00pm start is offered even if the job ends after 6pm.

## Hosted Postgres

Any managed Postgres that gives you a connection string is fine:

1. Create a Neon (or Vercel Postgres) project.
2. Put the URL in `DATABASE_URL`.
3. Run `npm run db:setup` once against that database, or let the app seed on first boot.

`docker-compose.yml` is the local equivalent: user `portal`, password `portal`, database `portal`.

## Mint a client

Normal path: drop a folder on the NAS and **Sync from NAS** (see below). Manual mint is for demo clients or people who are not on the share yet.

1. Open `https://admin.billy-kyle.com` (or local `/admin`) and enter `ADMIN_PASSWORD`.
2. Fill display name, primary contact email, optional company and notes.
3. **Mint next BK code** — the app assigns `BK00002`, `BK00003`, …
4. Open the client and **Attach shoot from NAS**: date, address, optional Dropbox URL, and the NAS folder path. Photos import from Final or Photos; floor plans and video come along from the same shoot folder. There is no placeholder-media option.
5. Tap a shoot row to open the same `/shoots/[id]` page clients see (photos, downloads, Dropbox, public share). **Delete shoot** and **Mark delivered** stay on the admin list and on that preview. The BK invite stays.

Give the invite code to the client. Anyone with that code can create an account and see every shoot on it.

## Edit or remove a client

Open a client from admin (the list is titled **Admin**). Invite `BK#####` is the client key and is never edited.

- **Client info** — change display name, primary contact email, company, and internal notes, then **Save client**. Those persist to Postgres. Do not rename someone whose NAS folder still uses the old name — sync matches by display name and would mint a new BK code.
- **Teammate logins** — each email/password account that redeemed the invite. **Remove** deletes that login only. The client and invite stay. They can sign up again with the same BK code.
- **Delete client** — destructive. Type the invite code and `DELETE`. This removes the client record, every teammate login under it, and all attached shoots and photos. If the NAS folder is still there, the next sync mints a new BK code for that name.

Use **Remove** on a teammate when you only need to kick one person. Use **Delete client** when the whole BK record should go away.

## NAS (UGOS share-download)

The first live proof is **Sam Lepore / 2026.09.04 - 12 Wood View Drive** (~83 JPGs in `Final`). The importer is not Sam-specific: any matching folder on the share becomes a client, shoot, and stills set.

The portal never points the browser at ug.link — it talks to UGOS on the server and proxies files.

### Share env

Set these in `.env.local` (see `.env.example`):

```
NAS_ENABLED=true
NAS_SHARE_HOST=https://10128873.us15.ug.link
NAS_SHARE_ID=2b5682e6af0a419393595b283f58d88d
NAS_SHARE_PASSWORD=
NAS_STILLS_FOLDERS=Final,Photos
```

`NAS_SHARE_PASSWORD` is empty today. Keep the variable so a locked share can be wired without a code change.

Do not put the short `ug.link` marketing URL in `NAS_SHARE_HOST`. That host serves the share UI, not the file API. The real API is `{NAS_SHARE_HOST}/ugreen/v1`.

### Folder layout (auto-import)

```
Client Deliverables /
  {client display name} /
    {YYYY.MM.DD|YYYY-MM-DD} - {address} /
      Final/   or   Photos/     → photos (first match in NAS_STILLS_FOLDERS)
      Floor Plan/               → floor plans (recursive: W sqft, jpg-with-dim, 3D Floorplan, …)
      3D Floorplan/             → more floor plans
      *.mp4  *.mov              → video sitting on the shoot folder
      Video/  or  Videos/       → video in a sibling folder
    {YYYY.MM.DD} - {Month} Videos /
      *.mp4  *.mov              → video-only shoot (same date - address rule)
```

- A new `{client}` folder upserts a client by display name and mints the next BK code if needed. Existing clients (matched case-insensitively) keep their invite and email.
- A new `{date} - {address}` folder creates a shoot with a public `/s/[token]` link.
- **Photos** come from **`Final` or `Photos`** (first match in `NAS_STILLS_FOLDERS`).
- **Floor plans** come from any sibling folder whose name matches `Floor Plan`, `Floorplan`, `3D Floorplan`, or `Plans`, including nested folders. JPGs, PNGs, SVG, and PDF are imported. Nested copies (`W sqft` / `Wo sqft`, `jpg-with-dim` / `jpg-without-dim`) are all kept; the portal filename includes the relative path so they do not overwrite each other.
- **Video** comes from `.mp4` / `.mov` / `.webm` / `.m4v` on the shoot folder itself, inside a `Video`/`Videos` folder, or inside Final/Photos. Monthly `{date} - January Videos` folders are valid shoots.
- A file is typed by extension first (video), then by the folder it lives in (floor plan), then by `floor`/`plan` in the filename, otherwise photo.
- Folders that are not `date - address` are skipped (logged as warnings). Client-level `Floor Plan` or `Photos` buckets that are not a shoot folder are ignored.
- **NAS is the source of truth for files.** Sync adds new photos, floor plans, and video, updates paths, and deletes portal files that are not on the share (including leftover `/samples/` placeholders). A shoot is created when any of those files exist — empty NAS folders do not become 0-file portal shoots, and existing empty ones are removed. Shoots with no matching NAS folder are removed. Clients are not deleted if their folder disappears. If the share walk returns zero client folders, orphan prune is skipped so a failed listing cannot wipe the library.

### Clear demo / test shoots on BK00001

Empty databases no longer seed Maple Avenue or West 12th. To strip those test projects from an existing database (keeps the BK00001 client and any real NAS shoots):

```
DATABASE_URL='postgresql://…' npm run db:clear-demo-shoots -- --invite BK00001
```

That keeps the BK00001 client and logins. It deletes Whitfield/Austin placeholder shoots and any 0-file portal shoots. Pass `--keep-empty` to leave empty shoots alone.

Or in admin: open the client → **Delete shoot** on that project (confirm in the dialog). The BK invite stays. After deploy, **Sync from NAS** also drops portal-only and empty shoots.

Example that is already on the share:

```
Client Deliverables / Sam Lepore / 2026.09.04 - 12 Wood View Drive / Final /
  Full-01.jpg … Full-81.jpg + twilight variants
```

### Run sync

The same walk runs from:

- the running app, every **10 minutes** (`NAS_SYNC_INTERVAL_MINUTES`)
- first boot, once, when `NAS_ENABLED=true`
- `npm run nas:sync`
- **Sync from NAS** in admin

Drop a folder on the share and wait up to 10 minutes, or sync now with the script or the admin button. Overlapping runs are skipped (one lock). Logs look like `NAS sync start (interval)` and `NAS sync done (interval) … +clients / +shoots / +stills`.

Turn the timer off:

```
NAS_SYNC_INTERVAL_MINUTES=0
# or
NAS_SYNC_ENABLED=false
```

Optional: warm thumbnail cache after a manual sync (`npm run nas:sync:warm`). Tiles otherwise fetch thumbs on first view.

On Vercel the in-process timer is off (serverless isolates freeze). Production uses `vercel.json` → `GET /api/cron/nas-sync` every 10 minutes. Admin **Sync from NAS** still works.

A system cron is only a backup for a long-running Node host:

```
*/10 * * * * cd /path/to/portal && npm run nas:sync
```

New clients created from the share get a placeholder email (`{name}@pending.local`) and no login. Give them the minted BK code so they can sign up. Sam Lepore already has `sam@example.com` from the first import; later syncs reuse that record.

### How the proxy works

1. `POST /filemgr/externalVerifySharePassword` — sets `share_cookie_{id}` (password field is sent even when empty).
2. `POST /filemgr/getShearDirFileList` — walk the tree and list JPGs.
3. `GET /filemgr/shareThumbnail?type=1&size_type=1` — small tile (~40KB). Failed tiles retry; the proxy does not rotate the share cookie on a single miss.
4. `POST /filemgr/addPathsByShareId` then `GET /filemgr/shareDownloadFile` — full file.

The portal caches thumbs and full files under `NAS_CACHE_DIR` after the first request so repeat views do not re-hit the NAS.

**Download** on a shoot page starts one streaming zip (`/api/shoots/[id]/zip` or `/api/s/[token]/zip`). The server reads files from the NAS cache (or the share) one at a time and pipes a STORE zip so Vercel does not have to hold all 83 JPEGs before the first byte. The browser saves that attachment directly (Safari/iPhone confirms once) instead of buffering a ~470MB archive in JavaScript. The page polls zip-job progress and shows preparing → downloading (files, bytes, speed, time remaining) → saved or failed. Named `{date} - {address}.zip` (or `{date} - {address} - Photos.zip` when a type is chosen). Per-tile **Download** still saves that one file.

Dropbox is backup only, behind the collapsed **Dropbox** control.

## Stack

- Next.js App Router, TypeScript, Tailwind, shadcn/ui
- Email/password sessions (JWT httpOnly cookies)
- Drizzle ORM + Postgres
- Optional Resend for password reset and booking confirmation

## Deploy on Vercel (Origin)

Import this Origin repo into the **billy-kyle** Vercel Pro team. Do not mirror to GitHub.

Vercel can already see the **billykyle** Origin namespace, but it will show **No Git Repositories Found** until this Cloud Agent `tmp-*` workspace is published as a real Origin repo (**Create repo** in Cursor, or **New** at [cursor.com/codebase](https://cursor.com/codebase)). Then grant the Vercel app that repo (**Settings → Apps → Manage Apps**, and Vercel **Settings → Git → Origin → Manage on Cursor**).

Framework: Next.js. Build: `next build`. Client URL: `https://portal.billy-kyle.com`. Admin URL: `https://admin.billy-kyle.com` (same Vercel project; Flynn adds the domain + Squarespace CNAME).

Set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `PORTAL_PUBLIC_URL=https://portal.billy-kyle.com`, `ADMIN_PUBLIC_URL=https://admin.billy-kyle.com`, the `NAS_*` share values, and `CRON_SECRET` before the first production deploy. Placeholders live in `.env.example`.

Exact click-path, env table, and serverless sync notes: [docs/vercel.md](docs/vercel.md).
