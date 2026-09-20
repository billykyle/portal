import { count, eq, isNull } from "drizzle-orm";
import { runLockedNasSync, startNasSyncScheduler } from "../nas-scheduler";
import { createPublicToken } from "../public-link";
import { useInProcessNasScheduler } from "../runtime";
import { db, sql } from "./index";
import { clients, shoots } from "./schema";
import { seedDemo } from "./seed";

let ready: Promise<void> | null = null;

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
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
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
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS shoots_public_token_uidx ON shoots (public_token)`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE media_type AS ENUM ('photo', 'video', 'floor_plan');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      shoot_id uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
      type media_type NOT NULL,
      filename text NOT NULL,
      url text NOT NULL,
      nas_relative_path text,
      sort_order integer NOT NULL DEFAULT 0
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
      drive_seconds_from_prior integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS services text[]`;
  await sql`
    UPDATE bookings
    SET services = ARRAY[service]
    WHERE services IS NULL AND service IS NOT NULL AND btrim(service) <> ''
  `;
  await sql`CREATE INDEX IF NOT EXISTS bookings_client_starts_idx ON bookings (client_id, starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS bookings_starts_idx ON bookings (starts_at)`;
}

export async function ensureDb() {
  if (!ready) {
    ready = (async () => {
      await createTables();
      const missing = await db.select({ id: shoots.id }).from(shoots).where(isNull(shoots.publicToken));
      for (const row of missing) {
        await db.update(shoots).set({ publicToken: createPublicToken() }).where(eq(shoots.id, row.id));
      }
      await sql`ALTER TABLE shoots ALTER COLUMN public_token SET NOT NULL`;
      const [{ value }] = await db.select({ value: count() }).from(clients);
      if (value === 0) {
        await seedDemo();
      }
      if (useInProcessNasScheduler()) {
        try {
          await runLockedNasSync("boot");
        } catch (error) {
          console.error("NAS share sync skipped:", error);
        }
      } else {
        console.log("NAS boot sync skipped on Vercel (use cron or admin)");
      }
      startNasSyncScheduler();
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
