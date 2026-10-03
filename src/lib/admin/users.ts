import { eq } from "drizzle-orm";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users, type User } from "@/lib/db/schema";
import { parseAccountProfile, parseLoginEmail } from "@/lib/signup-fields";
import { listMemberUsers, removeExtraInviteCode, userBelongsToClient } from "@/lib/user-portals";

export type UserWriteResult =
  | { ok: true; value: User; company: string }
  | { ok: false; error: string; where: "clients" | "client" | "profile" };

export async function listUsersForClient(clientId: string) {
  await ensureDb();
  if (!isUuid(clientId)) return { ok: false as const, error: "Client was not found." };
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { ok: false as const, error: "Client was not found." };
  const rows = await listMemberUsers(clientId);
  return { ok: true as const, value: { client, users: rows } };
}

/**
 * Same fields as Account. Email is `users.email`, the credentials login.
 * Saving a new address updates that identity. Company is the shared client company.
 */
export async function updateClientUserRecord(input: {
  clientId?: string | null;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<UserWriteResult> {
  await ensureDb();
  const clientId = String(input.clientId ?? "").trim();
  const userId = String(input.userId ?? "").trim();
  if (!clientId || !userId) {
    return { ok: false, error: "User is required.", where: "clients" };
  }
  if (!isUuid(clientId) || !isUuid(userId)) {
    return { ok: false, error: "User was not found on this client.", where: "client" };
  }

  const profile = parseAccountProfile({
    firstName: input.firstName,
    lastName: input.lastName,
    companyName: input.companyName,
    phone: input.phone,
  });
  if (!profile.ok) return { ok: false, error: profile.error, where: "profile" };
  const email = parseLoginEmail(input.email);
  if (!email.ok) return { ok: false, error: email.error, where: "profile" };

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { ok: false, error: "Client was not found.", where: "clients" };
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await userBelongsToClient(user.id, clientId))) {
    return { ok: false, error: "User was not found on this client.", where: "client" };
  }

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.value)).limit(1);
  if (taken && taken.id !== user.id) {
    return { ok: false, error: "That email already has an account.", where: "profile" };
  }

  const [saved] = await db
    .update(users)
    .set({
      firstName: profile.value.firstName,
      lastName: profile.value.lastName,
      phone: profile.value.phone,
      email: email.value,
    })
    .where(eq(users.id, user.id))
    .returning();
  await db.update(clients).set({ company: profile.value.companyName }).where(eq(clients.id, clientId));
  return { ok: true, value: saved, company: profile.value.companyName };
}

export async function removeClientUserRecord(input: {
  clientId?: string | null;
  userId?: string | null;
}): Promise<{ ok: true; email: string; detached: boolean } | { ok: false; error: string; where: "client" }> {
  await ensureDb();
  const clientId = String(input.clientId ?? "").trim();
  const userId = String(input.userId ?? "").trim();
  if (!clientId || !userId || !isUuid(clientId) || !isUuid(userId)) {
    return { ok: false, error: "User is required.", where: "client" };
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await userBelongsToClient(user.id, clientId))) {
    return { ok: false, error: "User was not found on this client.", where: "client" };
  }
  if (user.clientId !== clientId) {
    const removed = await removeExtraInviteCode({ userId: user.id, clientId });
    if (!removed.ok) return { ok: false, error: removed.error, where: "client" };
    return { ok: true, email: user.email, detached: true };
  }
  await db.delete(users).where(eq(users.id, userId));
  return { ok: true, email: user.email, detached: false };
}
