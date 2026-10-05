import { AsyncLocalStorage } from "node:async_hooks";
import { count, eq, isNull } from "drizzle-orm";
import { backfillPlaceholderPrimaryEmails } from "../client-contact";
import { ensurePreviewSchema } from "../nas-preview";
import { ensureNasSyncJobsTable } from "../nas-sync-store";
import { createPublicToken } from "../public-link";
import { backfillShootSlugs } from "../shoot-slug";
import { db, sql } from "./index";
import { clients, shoots } from "./schema";
import { seedDemo } from "./seed";

let ready: Promise<void> | null = null;

/** Set only on the call that is already inside ensureDb, so a nested call does not wait on itself. */
const migration = new AsyncLocalStorage<true>();

async function createTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invite_code text NOT NULL UNIQUE,
      display_name text NOT NULL,
      primary_email text NOT NULL,
      company text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      first_name text,
      last_name text,
      phone text,
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text`;
  await sql`
    CREATE TABLE IF NOT EXISTS user_clients (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, client_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_clients_client_idx ON user_clients (client_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS shoots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      shot_date text NOT NULL,
      address text NOT NULL,
      nas_relative_path text,
      dropbox_url text,
      public_token text UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE shoots ADD COLUMN IF NOT EXISTS public_token text`;
  await sql`ALTER TABLE shoots ADD COLUMN IF NOT EXISTS delivered_at timestamptz`;
  await sql`ALTER TABLE shoots ADD COLUMN IF NOT EXISTS slug text`;
  await sql`ALTER TABLE shoots ADD COLUMN IF NOT EXISTS category_folder text`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS shoots_public_token_uidx ON shoots (public_token)`;
  await sql`
    CREATE TABLE IF NOT EXISTS shoot_slug_aliases (
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      slug text NOT NULL,
      shoot_id uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
      PRIMARY KEY (client_id, slug)
    )
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE media_type AS ENUM ('photo', 'video', 'floor_plan', 'audio', 'raw_video');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'audio'`;
  await sql`ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'raw_video'`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE client_category AS ENUM ('real_estate', 'construction', 'podcast', 'other', 'commercial');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`ALTER TYPE client_category ADD VALUE IF NOT EXISTS 'commercial'`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS category client_category`;
  await sql`UPDATE clients SET category = 'real_estate' WHERE category IS NULL`;
  await sql`ALTER TABLE clients ALTER COLUMN category SET DEFAULT 'other'`;
  await sql`ALTER TABLE clients ALTER COLUMN category SET NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      shoot_id uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
      type media_type NOT NULL,
      filename text NOT NULL,
      url text NOT NULL,
      nas_relative_path text,
      width integer,
      height integer,
      sort_order integer NOT NULL DEFAULT 0
    )
  `;
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS width integer`;
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS height integer`;
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS byte_size bigint`;
  await sql`
    CREATE TABLE IF NOT EXISTS media_renditions (
      media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      quality text NOT NULL,
      nas_relative_path text NOT NULL,
      byte_size bigint,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (media_id, quality)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS zip_jobs (
      id text PRIMARY KEY,
      shoot_id uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
      state text NOT NULL,
      files_done integer NOT NULL DEFAULT 0,
      files_total integer NOT NULL DEFAULT 0,
      bytes integer NOT NULL DEFAULT 0,
      filename text NOT NULL,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE booking_status AS ENUM ('requested', 'confirmed', 'cancelled');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      address text NOT NULL,
      service text,
      services text[],
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      status booking_status NOT NULL DEFAULT 'confirmed',
      notes text,
      access_codes text,
      calendar_event_id text,
      sync_issue text,
      drive_seconds_from_prior integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS services text[]`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sync_issue text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_email_message_id text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_email_references text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_email_subject text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commercial_video_hours integer`;
  await sql`ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'queued'`;
  await sql`ALTER TABLE bookings ALTER COLUMN starts_at DROP NOT NULL`;
  await sql`ALTER TABLE bookings ALTER COLUMN ends_at DROP NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS maintenance_notices (
      id text PRIMARY KEY,
      message text NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    UPDATE bookings
    SET services = ARRAY[service]
    WHERE services IS NULL AND service IS NOT NULL AND btrim(service) <> ''
  `;
  await sql`CREATE INDEX IF NOT EXISTS bookings_client_starts_idx ON bookings (client_id, starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS bookings_starts_idx ON bookings (starts_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS booking_drafts (
      id text PRIMARY KEY,
      scope text NOT NULL,
      client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      address text NOT NULL DEFAULT '',
      place_id text,
      services text[],
      notes text,
      modify_booking_id text,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS commercial_video_hours integer`;
  await sql`CREATE INDEX IF NOT EXISTS booking_drafts_expires_idx ON booking_drafts (expires_at)`;
  await sql`DROP TABLE IF EXISTS upload_files`;
  await sql`DROP TABLE IF EXISTS upload_submissions`;
  await ensurePreviewSchema();
  await ensureNasSyncJobsTable();
}

export async function ensureDb() {
  if (migration.getStore()) return;
  if (!ready) {
    ready = migration.run(true, async () => {
      try {
        await createTables();
        await backfillShootSlugs();
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS shoots_client_slug_uidx ON shoots (client_id, slug)`;
        await sql`ALTER TABLE shoots ALTER COLUMN slug SET NOT NULL`;
        const missing = await db.select({ id: shoots.id }).from(shoots).where(isNull(shoots.publicToken));
        for (const row of missing) {
          await db.update(shoots).set({ publicToken: createPublicToken() }).where(eq(shoots.id, row.id));
        }
        await sql`ALTER TABLE shoots ALTER COLUMN public_token SET NOT NULL`;
        const [{ value }] = await db.select({ value: count() }).from(clients);
        if (value === 0) {
          await seedDemo();
        }
        await backfillPlaceholderPrimaryEmails();
      } catch (error) {
        ready = null;
        throw error;
      }
    });
  }
  return ready;
}
