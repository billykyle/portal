import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, maintenanceNotices } from "@/lib/db/schema";
import { MAINTENANCE_NOTICE_ID, type MaintenanceWindow } from "@/lib/maintenance";

export type StoredMaintenanceNotice = MaintenanceWindow & { updatedAt: Date };

async function loadMaintenanceNotice(): Promise<StoredMaintenanceNotice | null> {
  try {
    const [row] = await db
      .select()
      .from(maintenanceNotices)
      .where(eq(maintenanceNotices.id, MAINTENANCE_NOTICE_ID))
      .limit(1);
    if (!row) return null;
    return {
      message: row.message,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    console.error("maintenance notice read failed", error);
    return null;
  }
}

export const getMaintenanceNotice = cache(loadMaintenanceNotice);

export async function saveMaintenanceNotice(input: MaintenanceWindow): Promise<StoredMaintenanceNotice> {
  await ensureDb();
  const message = input.message.trim();
  const updatedAt = new Date();
  await db
    .insert(maintenanceNotices)
    .values({
      id: MAINTENANCE_NOTICE_ID,
      message,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: maintenanceNotices.id,
      set: {
        message,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        updatedAt,
      },
    });
  return { message, startsAt: input.startsAt, endsAt: input.endsAt, updatedAt };
}

export async function clearMaintenanceNotice() {
  await ensureDb();
  await db.delete(maintenanceNotices).where(eq(maintenanceNotices.id, MAINTENANCE_NOTICE_ID));
}

export async function listClientPrimaryEmails() {
  await ensureDb();
  const rows = await db.select({ email: clients.primaryEmail }).from(clients);
  return rows.map((row) => row.email);
}
