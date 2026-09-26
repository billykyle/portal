"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClientRecord,
  deleteClientRecord,
  findClient,
  updateClientRecord,
} from "@/lib/admin/clients";
import { removeClientUserRecord, updateClientUserRecord } from "@/lib/admin/users";
import { syncNasForAdmin } from "@/lib/admin/sync";
import { getAdminSession } from "@/lib/admin-auth";
import { CLIENT_ACCOUNT, CLIENT_HOME, CLIENT_LIBRARY } from "@/lib/routes";

export type AdminState = {
  error?: string;
  minted?: string;
};

function adminClientsUrl(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/admin/clients?${query.toString()}`;
}

function clientAdminPath(clientId: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const suffix = query.toString();
  return suffix ? `/admin/clients/${clientId}?${suffix}` : `/admin/clients/${clientId}`;
}

function userProfilePath(clientId: string, userId: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const suffix = query.toString();
  const path = `/admin/clients/${clientId}/users/${userId}`;
  return suffix ? `${path}?${suffix}` : path;
}

export async function mintClient(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const created = await createClientRecord({
    displayName: String(formData.get("displayName") ?? ""),
    primaryEmail: String(formData.get("primaryEmail") ?? ""),
    company: String(formData.get("company") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!created.ok) {
    redirect(adminClientsUrl({ error: created.error }));
  }
  revalidatePath("/admin/clients");
  redirect(adminClientsUrl({ minted: created.value.inviteCode }));
}

export async function syncNasFromAdmin() {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const result = await syncNasForAdmin();
  if (!result.ok) {
    redirect(adminClientsUrl({ syncError: result.error }));
  }
  const sync = result.value;
  revalidatePath("/admin/clients");
  redirect(
    adminClientsUrl({
      synced: "1",
      clients: String(sync.clientsCreated),
      shoots: String(sync.shootsCreated),
      photos: String(sync.mediaImported),
      refreshed: String(sync.mediaUpdated),
      reusedClients: String(sync.clientsReused),
      reusedShoots: String(sync.shootsReused),
      removedShoots: String(sync.shootsRemoved),
      removedPhotos: String(sync.mediaRemoved),
      warnings: String(sync.warnings.filter((warning) => !warning.includes("no real email")).length),
      ...(sync.warnings.some((warning) => warning.includes("no real email"))
        ? {
            emailSkipped: sync.warnings.filter((warning) => warning.includes("no real email")).join(" "),
          }
        : {}),
      ready: String(sync.ready),
    }),
  );
}

export async function updateClient(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const clientId = String(formData.get("clientId") ?? "");
  const saved = await updateClientRecord({
    clientId,
    displayName: String(formData.get("displayName") ?? ""),
    primaryEmail: String(formData.get("primaryEmail") ?? ""),
    company: String(formData.get("company") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!saved.ok) {
    if (saved.where === "clients") redirect(adminClientsUrl({ error: saved.error }));
    redirect(clientAdminPath(clientId, { error: saved.error }));
  }
  revalidatePath("/admin/clients");
  revalidatePath(clientAdminPath(clientId));
  redirect(clientAdminPath(clientId, { saved: "1" }));
}

export async function deleteClient(formData: FormData) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const clientId = String(formData.get("clientId") ?? "");
  const typedCode = String(formData.get("confirmCode") ?? "").replace(/\s+/g, "").toUpperCase();
  const typedDelete = String(formData.get("confirmDelete") ?? "").trim().toUpperCase();

  if (!clientId) {
    redirect(adminClientsUrl({ error: "Client is required." }));
  }

  const found = await findClient({ id: clientId });
  if (!found.ok) {
    redirect(adminClientsUrl({ error: "Client was not found." }));
  }
  if (typedCode !== found.value.inviteCode) {
    redirect(clientAdminPath(clientId, { error: "Type the invite code exactly to delete." }));
  }
  if (typedDelete !== "DELETE") {
    redirect(clientAdminPath(clientId, { error: "Type DELETE to confirm." }));
  }

  const removed = await deleteClientRecord(clientId);
  if (!removed.ok) {
    redirect(adminClientsUrl({ error: removed.error }));
  }
  revalidatePath("/admin/clients");
  redirect(adminClientsUrl({ removed: removed.value.inviteCode }));
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
  const clientId = String(formData.get("clientId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const saved = await updateClientUserRecord({
    clientId,
    userId,
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!saved.ok) {
    if (saved.where === "clients") redirect(adminClientsUrl({ error: saved.error }));
    if (saved.where === "client") redirect(clientAdminPath(clientId, { error: saved.error }));
    redirect(userProfilePath(clientId, userId, { error: saved.error }));
  }

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
  const clientId = String(formData.get("clientId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const removed = await removeClientUserRecord({ clientId, userId });
  if (!removed.ok) {
    redirect(clientAdminPath(clientId, { error: removed.error }));
  }
  revalidatePath(clientAdminPath(clientId));
  redirect(clientAdminPath(clientId, { userRemoved: removed.email }));
}
