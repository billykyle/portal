"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminPasswordMatches,
  clearAdminSession,
  createAdminSession,
  getAdminSession,
} from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots, users } from "@/lib/db/schema";
import { formatInviteCode, parseInviteSequence } from "@/lib/invite";
import { guessMediaType, joinUrl } from "@/lib/media";
import { importNasStills, resolveShootFolder } from "@/lib/nas-import";
import { runLockedNasSync } from "@/lib/nas-scheduler";
import { nasEnabled } from "@/lib/nas";
import { buildDeliveryPayload, notifyDeliveryWebhook } from "@/lib/delivery";
import { createPublicToken } from "@/lib/public-link";
import { mapleMedia } from "@/lib/sample-media";

export type AdminState = {
  error?: string;
  minted?: string;
};

export async function adminLogin(_prev: AdminState | undefined, formData: FormData) {
  if (!adminPasswordMatches(String(formData.get("password") ?? ""))) {
    return { error: "Password is incorrect." };
  }
  await createAdminSession();
  redirect("/admin/clients");
}

export async function adminLogout() {
  await clearAdminSession();
  redirect("/admin");
}

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

  const nasRelativePath = String(formData.get("nasRelativePath") ?? "").trim() || `${shotDate} - ${address}`;
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

  const usePlaceholder = formData.get("usePlaceholderMedia") === "on";
  const importNas = formData.get("importNasStills") === "on";
  if (usePlaceholder) {
    await db.insert(media).values(
      mapleMedia.map((item) => ({
        ...item,
        shootId: shoot.id,
        nasRelativePath: `${nasRelativePath}/${item.filename}`,
      })),
    );
  } else if (importNas) {
    if (!nasEnabled()) {
      redirect(`${clientPath}?error=${encodeURIComponent("Turn on NAS_ENABLED to import stills.")}`);
    }
    try {
      const folder = await resolveShootFolder(nasRelativePath);
      await importNasStills(shoot.id, folder, { required: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "NAS import failed.";
      redirect(`${clientPath}?error=${encodeURIComponent(message)}`);
    }
  } else {
    const lines = String(formData.get("mediaPaths") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const nasBase = process.env.NAS_BASE_URL?.trim();
    const rows = lines.map((line, index) => {
      const isAbsolute = /^https?:\/\//i.test(line) || line.startsWith("/");
      const filename = line.split("/").filter(Boolean).at(-1) ?? `file-${index + 1}`;
      const relative = isAbsolute ? `${nasRelativePath}/${filename}` : line.replace(/^\/+/, "");
      return {
        shootId: shoot.id,
        type: guessMediaType(filename),
        filename,
        url: isAbsolute ? line : nasBase ? joinUrl(nasBase, relative) : "/samples/maple-exterior.jpg",
        nasRelativePath: relative,
        sortOrder: index + 1,
      };
    });
    if (rows.length > 0) {
      await db.insert(media).values(rows);
    }
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
