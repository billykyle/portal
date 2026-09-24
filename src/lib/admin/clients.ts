import { count, desc, eq } from "drizzle-orm";
import { adminFail, type AdminResult } from "@/lib/admin/result";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, shoots, users, type Client } from "@/lib/db/schema";
import { formatInviteCode, isInviteCode, normalizeInviteCode, parseInviteSequence } from "@/lib/invite";

export async function listClientRows() {
  await ensureDb();
  return db.select().from(clients).orderBy(desc(clients.createdAt));
}

export async function clientCounts() {
  await ensureDb();
  const [userRows, shootRows] = await Promise.all([
    db
      .select({ clientId: users.clientId, value: count() })
      .from(users)
      .groupBy(users.clientId),
    db
      .select({ clientId: shoots.clientId, value: count() })
      .from(shoots)
      .groupBy(shoots.clientId),
  ]);
  return {
    users: new Map(userRows.map((row) => [row.clientId, Number(row.value)])),
    shoots: new Map(shootRows.map((row) => [row.clientId, Number(row.value)])),
  };
}

export async function findClient(input: {
  id?: string | null;
  inviteCode?: string | null;
}): Promise<AdminResult<Client>> {
  await ensureDb();
  const id = String(input.id ?? "").trim();
  const code = normalizeInviteCode(String(input.inviteCode ?? ""));
  if (!id && !code) return adminFail("Client id or invite code is required.");
  if (id && !isUuid(id)) return adminFail("Client was not found.");
  if (!id && code && !isInviteCode(code)) return adminFail("Client was not found.");

  const [client] = await db
    .select()
    .from(clients)
    .where(id ? eq(clients.id, id) : eq(clients.inviteCode, code))
    .limit(1);
  if (!client) return adminFail("Client was not found.");
  if (id && code && client.inviteCode !== code) return adminFail("Client was not found.");
  return { ok: true, value: client };
}

export async function createClientRecord(input: {
  displayName?: string | null;
  primaryEmail?: string | null;
  company?: string | null;
  notes?: string | null;
}): Promise<AdminResult<Client>> {
  await ensureDb();
  const displayName = String(input.displayName ?? "").trim();
  const primaryEmail = String(input.primaryEmail ?? "").trim().toLowerCase();
  if (!displayName) return adminFail("Display name is required.");
  if (!primaryEmail || !primaryEmail.includes("@")) {
    return adminFail("Primary contact email is required.");
  }

  const existing = await db.select({ inviteCode: clients.inviteCode }).from(clients);
  const next =
    existing.reduce((max, row) => Math.max(max, parseInviteSequence(row.inviteCode) ?? 0), 0) + 1;
  const [client] = await db
    .insert(clients)
    .values({
      inviteCode: formatInviteCode(next),
      displayName,
      primaryEmail,
      company: String(input.company ?? "").trim() || null,
      notes: String(input.notes ?? "").trim() || null,
    })
    .returning();
  return { ok: true, value: client };
}

export type ClientWriteResult =
  | { ok: true; value: Client }
  | { ok: false; error: string; where: "clients" | "client" };

export async function updateClientRecord(input: {
  clientId?: string | null;
  displayName?: string | null;
  primaryEmail?: string | null;
  company?: string | null;
  notes?: string | null;
}): Promise<ClientWriteResult> {
  await ensureDb();
  const clientId = String(input.clientId ?? "").trim();
  const displayName = String(input.displayName ?? "").trim();
  const primaryEmail = String(input.primaryEmail ?? "").trim().toLowerCase();
  const company = String(input.company ?? "").trim();
  const notes = String(input.notes ?? "").trim();

  if (!clientId) return { ok: false, error: "Client is required.", where: "clients" };
  if (!isUuid(clientId)) return { ok: false, error: "Client was not found.", where: "clients" };
  if (!displayName) {
    return { ok: false, error: "Display name is required.", where: "client" };
  }
  if (!primaryEmail || !primaryEmail.includes("@")) {
    return { ok: false, error: "Primary contact email is required.", where: "client" };
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { ok: false, error: "Client was not found.", where: "clients" };

  const [saved] = await db
    .update(clients)
    .set({
      displayName,
      primaryEmail,
      company: company || null,
      notes: notes || null,
    })
    .where(eq(clients.id, clientId))
    .returning();
  return { ok: true, value: saved };
}

export async function deleteClientRecord(clientId: string): Promise<AdminResult<{ inviteCode: string }>> {
  await ensureDb();
  if (!isUuid(clientId)) return adminFail("Client was not found.");
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return adminFail("Client was not found.");
  await db.delete(clients).where(eq(clients.id, clientId));
  return { ok: true, value: { inviteCode: client.inviteCode } };
}
