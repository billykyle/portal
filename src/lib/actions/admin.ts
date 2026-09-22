"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots, users } from "@/lib/db/schema";
import { formatInviteCode, parseInviteSequence } from "@/lib/invite";
import { importNasStills, resolveShootFolder } from "@/lib/nas-import";
import { runLockedNasSync } from "@/lib/nas-scheduler";
import { nasEnabled } from "@/lib/nas-flags";
import { buildDeliveryPayload, notifyDeliveryWebhook } from "@/lib/delivery";
import { createPublicToken } from "@/lib/public-link";
import { CLIENT_ACCOUNT, CLIENT_HOME, CLIENT_LIBRARY } from "@/lib/routes";
import { parseAccountProfile, parseLoginEmail } from "@/lib/signup-fields";

export type AdminState = {
  error?: string;
  minted?: string;
};

function adminClientsUrl(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/admin/clients?${query.toString()}`;
}

export async function mintClient(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const primaryEmail = String(formData.get("primaryEmail") ?? "").trim().toLowerCase();
  if (!displayName) {
    redirect(adminClientsUrl({ error: "Display name is required." }));
  }
  if (!primaryEmail || !primaryEmail.includes("@")) {
    redirect(adminClientsUrl({ error: "Primary contact email is required." }));
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
      company: String(formData.get("company") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .returning();

  revalidatePath("/admin/clients");
  redirect(adminClientsUrl({ minted: client.inviteCode }));
}

export async function attachShoot(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const clientId = String(formData.get("clientId") ?? "");
  const shotDate = String(formData.get("shotDate") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const clientPath = `/admin/clients/${clientId}`;
  if (!clientId) {
    redirect("/admin/clients?error=Client%20is%20required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shotDate)) {
    redirect(`${clientPath}?error=${encodeURIComponent("Date must be YYYY-MM-DD.")}`);
  }
  if (!address) {
    redirect(`${clientPath}?error=${encodeURIComponent("Address is required.")}`);
  }

  const nasRelativePath = String(formData.get("nasRelativePath") ?? "").trim();
  if (!nasRelativePath) {
    redirect(`${clientPath}?error=${encodeURIComponent("NAS folder is required. Files come from the share only.")}`);
  }
  if (!nasEnabled()) {
    redirect(`${clientPath}?error=${encodeURIComponent("Turn on NAS_ENABLED to attach a shoot.")}`);
  }

  const [shoot] = await db
    .insert(shoots)
    .values({
      clientId,
      publicToken: createPublicToken(),
      shotDate,
      address,
      nasRelativePath,
      dropboxUrl: String(formData.get("dropboxUrl") ?? "").trim() || null,
    })
    .returning();

  try {
    const folder = await resolveShootFolder(nasRelativePath);
    await importNasStills(shoot.id, folder, { required: true });
  } catch (error) {
    // The row never imported. This is not a way to delete a NAS-mirrored shoot.
    await db.delete(shoots).where(eq(shoots.id, shoot.id));
    const message = error instanceof Error ? error.message : "NAS import failed.";
    redirect(`${clientPath}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(clientPath);
  redirect(`${clientPath}?attached=1`);
}

export async function syncNasFromAdmin() {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  let result;
  try {
    result = await runLockedNasSync("admin");
  } catch (error) {
    const message = error instanceof Error ? error.message : "NAS sync failed.";
    redirect(adminClientsUrl({ error: message }));
  }
  if (result.skipped) {
    redirect(adminClientsUrl({ error: result.reason ?? "NAS sync skipped." }));
  }
  revalidatePath("/admin/clients");
  redirect(
    adminClientsUrl({
        synced: "1",
        clients: String(result.clientsCreated),
        shoots: String(result.shootsCreated),
        photos: String(result.mediaImported),
        refreshed: String(result.mediaUpdated),
        reusedClients: String(result.clientsReused),
        reusedShoots: String(result.shootsReused),
        removedShoots: String(result.shootsRemoved),
        removedPhotos: String(result.mediaRemoved),
        warnings: String(result.warnings.length),
        ready: String(result.ready),
      }),
  );
}

export async function markShootDelivered(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const shootId = String(formData.get("shootId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const clientPath = `/admin/clients/${clientId}`;
  if (!shootId || !clientId) {
    redirect(`${clientPath}?error=${encodeURIComponent("Shoot is required.")}`);
  }
  const [shoot] = await db.select().from(shoots).where(eq(shoots.id, shootId)).limit(1);
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!shoot || !client || shoot.clientId !== client.id) {
    redirect(`${clientPath}?error=${encodeURIComponent("Shoot was not found.")}`);
  }
  await db.update(shoots).set({ deliveredAt: new Date() }).where(eq(shoots.id, shoot.id));
  const fileCount = (await db.select({ id: media.id }).from(media).where(eq(media.shootId, shoot.id))).length;
  try {
    await notifyDeliveryWebhook(
      buildDeliveryPayload({
        event: "shoot.delivered",
        client,
        shoot,
        fileCount,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery webhook failed.";
    redirect(`${clientPath}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(clientPath);
  redirect(`${clientPath}?delivered=1`);
}

function clientAdminPath(clientId: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const suffix = query.toString();
  return suffix ? `/admin/clients/${clientId}?${suffix}` : `/admin/clients/${clientId}`;
}

export async function updateClient(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const clientId = String(formData.get("clientId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const primaryEmail = String(formData.get("primaryEmail") ?? "").trim().toLowerCase();
  const company = String(formData.get("company") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!clientId) {
    redirect(adminClientsUrl({ error: "Client is required." }));
  }
  if (!displayName) {
    redirect(clientAdminPath(clientId, { error: "Display name is required." }));
  }
  if (!primaryEmail || !primaryEmail.includes("@")) {
    redirect(clientAdminPath(clientId, { error: "Primary contact email is required." }));
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    redirect(adminClientsUrl({ error: "Client was not found." }));
  }

  await db
    .update(clients)
    .set({
      displayName,
      primaryEmail,
      company: company || null,
      notes: notes || null,
    })
    .where(eq(clients.id, clientId));

  revalidatePath("/admin/clients");
  revalidatePath(clientAdminPath(clientId));
  redirect(clientAdminPath(clientId, { saved: "1" }));
}

export async function deleteClient(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const clientId = String(formData.get("clientId") ?? "");
  const typedCode = String(formData.get("confirmCode") ?? "").replace(/\s+/g, "").toUpperCase();
  const typedDelete = String(formData.get("confirmDelete") ?? "").trim().toUpperCase();

  if (!clientId) {
    redirect(adminClientsUrl({ error: "Client is required." }));
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    redirect(adminClientsUrl({ error: "Client was not found." }));
  }
  if (typedCode !== client.inviteCode) {
    redirect(clientAdminPath(clientId, { error: "Type the invite code exactly to delete." }));
  }
  if (typedDelete !== "DELETE") {
    redirect(clientAdminPath(clientId, { error: "Type DELETE to confirm." }));
  }

  await db.delete(clients).where(eq(clients.id, clientId));
  revalidatePath("/admin/clients");
  redirect(adminClientsUrl({ removed: client.inviteCode }));
}

function userProfilePath(clientId: string, userId: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const suffix = query.toString();
  const path = `/admin/clients/${clientId}/users/${userId}`;
  return suffix ? `${path}?${suffix}` : path;
}

/**
 * Same fields as Account. Email is `users.email`, the credentials login
 * (custom JWT session, not NextAuth). Saving a new address updates that
 * identity. Sessions stay valid because they key off user id; booking mail
 * reads the saved address.
 */
export async function updateUserProfile(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const clientId = String(formData.get("clientId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!clientId || !userId) {
    redirect(adminClientsUrl({ error: "User is required." }));
  }

  const profile = parseAccountProfile({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!profile.ok) {
    redirect(userProfilePath(clientId, userId, { error: profile.error }));
  }
  const email = parseLoginEmail(String(formData.get("email") ?? ""));
  if (!email.ok) {
    redirect(userProfilePath(clientId, userId, { error: email.error }));
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    redirect(adminClientsUrl({ error: "Client was not found." }));
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.clientId !== clientId) {
    redirect(clientAdminPath(clientId, { error: "User was not found on this client." }));
  }

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.value)).limit(1);
  if (taken && taken.id !== user.id) {
    redirect(userProfilePath(clientId, userId, { error: "That email already has an account." }));
  }

  await db
    .update(users)
    .set({
      firstName: profile.value.firstName,
      lastName: profile.value.lastName,
      phone: profile.value.phone,
      email: email.value,
    })
    .where(and(eq(users.id, user.id), eq(users.clientId, clientId)));
  await db.update(clients).set({ company: profile.value.companyName }).where(eq(clients.id, clientId));

  revalidatePath("/admin/clients");
  revalidatePath(clientAdminPath(clientId));
  revalidatePath(userProfilePath(clientId, userId));
  revalidatePath(CLIENT_ACCOUNT);
  revalidatePath(CLIENT_HOME);
  revalidatePath(CLIENT_LIBRARY);
  redirect(userProfilePath(clientId, userId, { saved: "1" }));
}

export async function removeUser(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const clientId = String(formData.get("clientId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!clientId || !userId) {
    redirect(clientAdminPath(clientId, { error: "User is required." }));
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.clientId !== clientId) {
    redirect(clientAdminPath(clientId, { error: "User was not found on this client." }));
  }

  await db.delete(users).where(eq(users.id, userId));
  revalidatePath(clientAdminPath(clientId));
  redirect(clientAdminPath(clientId, { userRemoved: user.email }));
}
