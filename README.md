# Billy Kyle Client Portal

Private, phone-first file delivery for Atmos Imagery / Billy Kyle. Clients redeem a permanent invite code, create their own login, and open every shoot attached to that code.

Black and white only. No favorites. Every shoot has a stable public link.

## What it does

1. Splash — enter invite code (`BK` + 5 digits).
2. Create account — email + password, or sign in.
3. Forgot password — email reset link (or an on-screen link when email is not configured).
4. Library — every shoot for that invite code, labeled date + address, newest first.
5. Shoot — in-app photo viewer, inline video, floor plans, **Download all** (folder picker when the browser allows it, otherwise one file at a time — never a zip) and per-file download.
6. Public link — every shoot has an unguessable `/s/[token]` URL. Copy it from the logged-in shoot page or from admin. Anyone with the link can view and download without signing in. There is no publish toggle.
7. Dropbox — collapsed control with the Dropbox view link (logged-in shoot page only).
8. Admin — Billy mints the next BK code and attaches shoots by hand. Kold can automate this later.

Invite codes are the client primary key. They start at **BK00001** and increment. One code is permanent and multi-use: teammates each create their own user and share the same shoot library.

## Run locally

You need Node 20+ and Postgres 16.

```bash
cp .env.example .env.local
# edit secrets if you want
docker compose up -d   # or any Postgres that matches DATABASE_URL
npm install
npm run db:setup       # creates tables and seeds BK00001 when empty
npm run nas:sync       # creates Sam Lepore + imports Wood View Drive stills when NAS_ENABLED=true
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
| Demo client | Invite `BK00001`, or sign in as `demo@example.com` / `portal1234` |
| Sam Lepore | Next minted BK code after existing clients (`BK00002` on a fresh database), or sign in as `sam@example.com` / `portal1234` |
| Admin  | `/admin` with `ADMIN_PASSWORD` (example: `atmos-admin`) |

Demo (placeholder) shoots on Whitfield:

- Sep 4, 2026 — 1847 Maple Avenue, Austin, TX
- Mar 18, 2026 — 412 West 12th Street, Unit 6B, Austin, TX

NAS-backed shoot on Sam Lepore (real JPGs from the UGOS share):

- Sep 4, 2026 — 12 Wood View Drive (`Final/` stills)

Each shoot has a public `/s/…` link. Copy it from the logged-in shoot page (or admin). No login is required to open that URL.

Sample photos, walkthrough videos, and floor plans for the Whitfield demo live in `public/samples/`. Sam’s shoot is proxied from the NAS.

## Env vars

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Postgres connection string. Neon or Vercel Postgres work as-is. |
| `JWT_SECRET` | Signs client and admin cookies. Use a long random string in production. |
| `ADMIN_PASSWORD` | Shared password for `/admin`. Billy only. |
| `DEMO_PASSWORD` | Password for the seeded `demo@example.com` user. |
| `NAS_ENABLED` | `true` serves NAS-backed media through the server proxy (`/api/media/[id]`). Keep `false` to use placeholder URLs. |
| `NAS_SHARE_HOST` | UGOS share host after the ug.link redirect, e.g. `https://10128873.us15.ug.link`. |
| `NAS_SHARE_ID` | Share id from the `?id=` query on the share-download URL. |
| `NAS_SHARE_PASSWORD` | Optional share password. Leave empty when the share has none. |
| `NAS_SHARE_URL` | Optional full share URL. Used to parse `id` and discover the real host if `NAS_SHARE_HOST` is unset. |
| `NAS_STILLS_FOLDERS` | Folder names to look under each shoot for stills. Default: `Final,Photos` (first match wins). |
| `NAS_CACHE_DIR` | Local cache for proxied thumbs and full files. Default: `.nas-cache`. |
| `RESEND_API_KEY` | Optional. Sends password-reset email. |
| `EMAIL_FROM` | From address when Resend is set. |

## Hosted Postgres

Any managed Postgres that gives you a connection string is fine:

1. Create a Neon (or Vercel Postgres) project.
2. Put the URL in `DATABASE_URL`.
3. Run `npm run db:setup` once against that database, or let the app seed on first boot.

`docker-compose.yml` is the local equivalent: user `portal`, password `portal`, database `portal`.

## Mint a client

1. Open `/admin` and enter `ADMIN_PASSWORD`.
2. Fill display name, primary contact email, optional company and notes.
3. **Mint next BK code** — the app assigns `BK00002`, `BK00003`, …
4. Open the client and **Attach shoot**: date, address, optional Dropbox URL, optional NAS folder.
5. Check **Import stills from NAS (Final or Photos)** to list JPGs from that shoot folder, or **Use sample placeholder media**, or paste one media path per line.

Give the invite code to the client. Anyone with that code can create an account and see every shoot on it.

## NAS (UGOS share-download)

The first live shoot is **Sam Lepore / 2026.09.04 - 12 Wood View Drive**. Stills live in **`Final`** (about 83 JPGs). The portal never points the browser at ug.link — it talks to UGOS on the server and proxies files.

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

### Stills rule

Under each shoot folder, look for **`Final` or `Photos`** (whichever exists; first match in `NAS_STILLS_FOLDERS` wins). This shoot uses **Final**:

```
Client Deliverables / Sam Lepore / 2026.09.04 - 12 Wood View Drive / Final /
  Full-01.jpg … Full-81.jpg + twilight variants
```

### How the proxy works

1. `POST /filemgr/externalVerifySharePassword` — sets `share_cookie_{id}` (password field is sent even when empty).
2. `POST /filemgr/getShearDirFileList` — walk the tree and list JPGs.
3. `GET /filemgr/shareThumbnail?type=1&size_type=3` — ~1920px tile/preview.
4. `POST /filemgr/addPathsByShareId` then `GET /filemgr/shareDownloadFile` — full file.

The portal caches thumbs and full files under `NAS_CACHE_DIR` after the first request so repeat views do not re-hit the NAS. Re-import with:

```
npm run nas:sync
```

That command is idempotent: it creates Sam Lepore (`BK00002`) if needed, attaches the Wood View Drive shoot, and refreshes media rows from Final.

Dropbox is backup only, behind the collapsed **Dropbox** control.

## Stack

- Next.js App Router, TypeScript, Tailwind, shadcn/ui
- Email/password sessions (JWT httpOnly cookies)
- Drizzle ORM + Postgres
- Optional Resend for password reset
