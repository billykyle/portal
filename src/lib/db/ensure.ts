import { count, eq, isNull } from "drizzle-orm";
import { createPublicToken } from "../public-link";
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
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
