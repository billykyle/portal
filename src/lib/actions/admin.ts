"use server";

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
import { clients, media, shoots } from "@/lib/db/schema";
import { formatInviteCode, parseInviteSequence } from "@/lib/invite";
import { guessMediaType, joinUrl } from "@/lib/media";
import { importNasStills, resolveShootFolder } from "@/lib/nas-import";
import { nasEnabled } from "@/lib/nas";
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
      await importNasStills(shoot.id, folder);
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
