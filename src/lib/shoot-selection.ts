import { isUuid } from "@/lib/admin/ids";

/** Enough for a full shoot folder. A longer list is refused instead of building a huge zip. */
export const SELECTION_ID_LIMIT = 500;

export function toggleSelectedId(selected: ReadonlySet<string>, id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectionCountLabel(count: number) {
  return `${count} selected`;
}

/** One original downloads directly. Two or more become one zip. */
export function selectionDownloadKind(count: number): "none" | "file" | "zip" {
  if (count <= 0) return "none";
  if (count === 1) return "file";
  return "zip";
}

export type ZipAccess =
  | { ok: true }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Account downloads need a signed-in user who can open that client
 * (home portal or an extra BK code), or an admin.
 * Share downloads need the shoot's public token.
 */
export function authorizeZipDownload(input: {
  kind: "account" | "share";
  admin: boolean;
  session: { userId: string; clientId: string } | null;
  /** Home client plus every extra BK code on this login. */
  accessibleClientIds: readonly string[];
  shoot: { id: string; clientId: string; publicToken: string } | null;
  shareToken?: string | null;
}): ZipAccess {
  if (!input.shoot) return { ok: false, status: 404, error: "Not found." };
  if (input.kind === "share") {
    if (!input.shareToken || input.shareToken !== input.shoot.publicToken) {
      return { ok: false, status: 404, error: "Not found." };
    }
    return { ok: true };
  }
  if (input.admin) return { ok: true };
  if (!input.session) {
    return { ok: false, status: 401, error: "Sign in to download this shoot." };
  }
  const allowed =
    input.session.clientId === input.shoot.clientId ||
    input.accessibleClientIds.includes(input.shoot.clientId);
  if (!allowed) return { ok: false, status: 404, error: "Not found." };
  return { ok: true };
}

export function parseSelectionIdList(
  value: unknown,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  let parts: string[];
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === "string")) {
      return { ok: false, error: "Choose files from this shoot." };
    }
    parts = value;
  } else if (typeof value === "string") {
    parts = value.split(",");
  } else {
    return { ok: false, error: "Choose files from this shoot." };
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const id = part.trim();
    if (!id) continue;
    if (!isUuid(id)) return { ok: false, error: "Choose files from this shoot." };
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return { ok: false, error: "Select at least one file." };
  if (ids.length > SELECTION_ID_LIMIT) {
    return { ok: false, error: "Select fewer files and try again." };
  }
  return { ok: true, ids };
}

/** Every requested id must belong to this shoot. Order follows the request. */
export function filesForSelection<T extends { id: string }>(
  shootFiles: readonly T[],
  requestedIds: readonly string[],
): { ok: true; files: T[] } | { ok: false; status: 400 | 404; error: string } {
  if (requestedIds.length === 0) {
    return { ok: false, status: 400, error: "Select at least one file." };
  }
  const byId = new Map(shootFiles.map((file) => [file.id, file]));
  const files: T[] = [];
  for (const id of requestedIds) {
    const file = byId.get(id);
    if (!file) return { ok: false, status: 404, error: "Not found." };
    files.push(file);
  }
  return { ok: true, files };
}

export async function readSelectionIds(
  request: Request,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as { ids?: unknown };
      return parseSelectionIdList(body?.ids);
    }
    if (
      type.includes("application/x-www-form-urlencoded") ||
      type.includes("multipart/form-data")
    ) {
      const form = await request.formData();
      const field = form.get("ids");
      return parseSelectionIdList(typeof field === "string" ? field : null);
    }
  } catch {
    return { ok: false, error: "Choose files from this shoot." };
  }
  return { ok: false, error: "Choose files from this shoot." };
}
