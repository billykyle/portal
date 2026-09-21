import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { bookingDrafts } from "@/lib/db/schema";
import {
  DRAFT_TTL_MS,
  draftAdoptPath,
  draftCookieName,
  draftCookieOptions,
  isDraftId,
  normalizeDraftInput,
  schedulingStepPath,
  type DraftScope,
  type DraftStep,
  type SchedulingDraft,
  type SchedulingDraftInput,
} from "./draft";

export function createDraftId() {
  return randomBytes(12).toString("base64url");
}

type DraftOwner = {
  clientId: string | null;
  userId: string | null;
};

function toDraft(row: typeof bookingDrafts.$inferSelect): SchedulingDraft | null {
  if (row.scope !== "client" && row.scope !== "admin") return null;
  const data = normalizeDraftInput({
    address: row.address,
    placeId: row.placeId,
    services: row.services ?? [],
    notes: row.notes,
    modifyBookingId: row.modifyBookingId,
  });
  return {
    id: row.id,
    scope: row.scope,
    updatedAt: row.updatedAt,
    ...data,
  };
}

async function deleteExpiredDrafts() {
  await db.delete(bookingDrafts).where(lt(bookingDrafts.expiresAt, new Date()));
}

export async function readSchedulingDraft(scope: DraftScope, clientId: string | null) {
  const store = await cookies();
  const id = store.get(draftCookieName(scope))?.value ?? "";
  if (!isDraftId(id)) return null;
  const [row] = await db.select().from(bookingDrafts).where(eq(bookingDrafts.id, id)).limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) await db.delete(bookingDrafts).where(eq(bookingDrafts.id, row.id));
    return null;
  }
  const draft = toDraft(row);
  if (!draft || draft.scope !== scope) return null;
  if (scope === "client" && row.clientId !== clientId) return null;
  return draft;
}

export async function readSchedulingDraftById(id: string) {
  if (!isDraftId(id)) return null;
  const [row] = await db.select().from(bookingDrafts).where(eq(bookingDrafts.id, id)).limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) await db.delete(bookingDrafts).where(eq(bookingDrafts.id, row.id));
    return null;
  }
  const draft = toDraft(row);
  if (!draft) return null;
  return { draft, clientId: row.clientId };
}

/**
 * Insert or update the caller's draft.
 * Cookie writes only happen when `setCookie` is true (Server Action or Route Handler).
 */
export async function writeSchedulingDraft(
  scope: DraftScope,
  input: SchedulingDraftInput,
  owner: DraftOwner,
  options?: { setCookie?: boolean },
) {
  const data = normalizeDraftInput(input);
  const store = await cookies();
  const current = store.get(draftCookieName(scope))?.value ?? "";
  const [existing] = isDraftId(current)
    ? await db.select().from(bookingDrafts).where(eq(bookingDrafts.id, current)).limit(1)
    : [];
  const canUpdate = Boolean(
    existing &&
      existing.scope === scope &&
      existing.expiresAt.getTime() > Date.now() &&
      (scope === "admin" || existing.clientId === owner.clientId),
  );
  const id = canUpdate ? current : createDraftId();
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const values = {
    scope,
    clientId: scope === "client" ? owner.clientId : null,
    userId: owner.userId,
    address: data.address,
    placeId: data.placeId || null,
    services: data.services,
    notes: data.notes || null,
    modifyBookingId: data.modifyBookingId,
    expiresAt,
    updatedAt: new Date(),
  };
  if (canUpdate) {
    await db.update(bookingDrafts).set(values).where(eq(bookingDrafts.id, id));
  } else {
    await db.insert(bookingDrafts).values({ id, ...values });
  }
  await deleteExpiredDrafts();
  if (options?.setCookie) {
    store.set(draftCookieName(scope), id, draftCookieOptions());
  }
  return id;
}

export async function clearSchedulingDraft(scope: DraftScope) {
  const store = await cookies();
  const id = store.get(draftCookieName(scope))?.value ?? "";
  if (isDraftId(id)) {
    await db.delete(bookingDrafts).where(eq(bookingDrafts.id, id));
  }
  store.delete(draftCookieName(scope));
}

/** Save a legacy query into a draft and return the next URL (clean path, or a short adopt hop). */
export async function migrateLegacySchedulingDraft(input: {
  scope: DraftScope;
  to: DraftStep;
  clientId: string | null;
  userId: string | null;
  address?: string | null;
  placeId?: string | null;
  service?: string | string[] | null;
  notes?: string | null;
  modify?: string | null;
  bookingId?: string | null;
  error?: string | null;
  cancelled?: string | null;
}) {
  const services = Array.isArray(input.service) ? input.service : input.service ? [input.service] : [];
  const data = normalizeDraftInput({
    address: input.address,
    placeId: input.placeId,
    services,
    notes: input.notes,
    modifyBookingId: input.scope === "admin" ? input.bookingId ?? input.modify : input.modify,
  });
  const existing = await readSchedulingDraft(input.scope, input.clientId);
  const id = await writeSchedulingDraft(input.scope, data, { clientId: input.clientId, userId: input.userId }, {
    setCookie: false,
  });
  const clean = schedulingStepPath({
    scope: input.scope,
    to: input.to,
    modifyBookingId: data.modifyBookingId,
    bookingId: input.bookingId ?? data.modifyBookingId,
    error: input.error,
    cancelled: input.cancelled,
  });
  if (existing && existing.id === id) return clean;
  return draftAdoptPath({ id, to: input.to, error: input.error, cancelled: input.cancelled });
}
