# Billy Kyle Client Portal

Private, phone-first file delivery for Atmos Imagery / Billy Kyle. Clients redeem a permanent invite code, create their own login, and open every shoot attached to that code.

Black and white only. No favorites. No share links.

## What it does

1. Splash — enter invite code (`BK` + 5 digits).
2. Create account — email + password, or sign in.
3. Forgot password — email reset link (or an on-screen link when email is not configured).
4. Library — every shoot for that invite code, labeled date + address, newest first.
5. Shoot — in-app photo viewer, inline video, floor plans, **Download all** (folder picker when the browser allows it, otherwise one file at a time — never a zip) and per-file download.
6. Backup — collapsed control with the Dropbox view link.
7. Admin — Billy mints the next BK code and attaches shoots by hand. Kold can automate this later.

Invite codes are the client primary key. They start at **BK00001** and increment. One code is permanent and multi-use: teammates each create their own user and share the same shoot library.

## Run locally

You need Node 20+ and Postgres 16.

```bash
cp .env.example .env.local
# edit secrets if you want
docker compose up -d   # or any Postgres that matches DATABASE_URL
npm install
npm run db:setup       # creates tables and seeds BK00001 when empty
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
| Client | Invite `BK00001`, or sign in as `demo@example.com` / `portal1234` |
| Admin  | `/admin` with `ADMIN_PASSWORD` (example: `atmos-admin`) |

Demo shoots:

- Sep 4, 2026 — 1847 Maple Avenue, Austin, TX
- Mar 18, 2026 — 412 West 12th Street, Unit 6B, Austin, TX

Sample photos, walkthrough videos, and floor plans live in `public/samples/` so the UI works without the NAS.

## Env vars

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Postgres connection string. Neon or Vercel Postgres work as-is. |
| `JWT_SECRET` | Signs client and admin cookies. Use a long random string in production. |
| `ADMIN_PASSWORD` | Shared password for `/admin`. Billy only. |
| `DEMO_PASSWORD` | Password for the seeded `demo@example.com` user. |
| `NAS_BASE_URL` | Ugreen Link public base URL. Placeholder until the real share exists. |
| `NAS_ENABLED` | `true` serves files from `NAS_BASE_URL` + each file’s `nasRelativePath`. Keep `false` to use placeholder URLs. |
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
5. Check **Use sample placeholder media**, or paste one media path per line.

Give the invite code to the client. Anyone with that code can create an account and see every shoot on it.

## NAS placeholders

Ugreen folder layout when the Link URL is live:

```
Client Projects / {client} / {date} - {address} /
  photos, floor plans, video
```

Until then:

- Each media row stores a working `url` (local `/samples/…` for the demo) and a `nasRelativePath`.
- Leave `NAS_ENABLED=false` so the portal keeps using placeholders.
- When the Ugreen Link URL is ready, set `NAS_BASE_URL` and `NAS_ENABLED=true`. Paths resolve as `{NAS_BASE_URL}/{nasRelativePath}`.

Dropbox is backup only, behind the collapsed **Backup** control.

## Stack

- Next.js App Router, TypeScript, Tailwind, shadcn/ui
- Email/password sessions (JWT httpOnly cookies)
- Drizzle ORM + Postgres
- Optional Resend for password reset
