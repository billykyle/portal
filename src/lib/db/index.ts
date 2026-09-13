import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  portalSql?: Sql;
  portalDb?: Database;
};

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  return url;
}

export function getSql(): Sql {
  if (!globalForDb.portalSql) {
    const max = process.env.VERCEL === "1" ? 1 : 10;
    globalForDb.portalSql = postgres(requireDatabaseUrl(), {
      max,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForDb.portalSql;
}

export function getDb(): Database {
  if (!globalForDb.portalDb) {
    globalForDb.portalDb = drizzle(getSql(), { schema });
  }
  return globalForDb.portalDb;
}

export const sql: Sql = new Proxy(function portalSql() {} as unknown as Sql, {
  apply(_target, thisArg, argArray) {
    return Reflect.apply(getSql() as unknown as (...args: unknown[]) => unknown, thisArg, argArray);
  },
  get(_target, prop) {
    const client = getSql() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
