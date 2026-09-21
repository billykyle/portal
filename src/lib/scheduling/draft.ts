import { ADMIN_BOOKINGS } from "@/lib/routes";
import { parseSchedulingServices } from "./services";
import { adminBookingHref, adminBookingTimesHref, schedulingBookHref, schedulingTimesHref } from "./urls";

/** Opaque id cookie for the client book/modify draft. */
export const CLIENT_DRAFT_COOKIE = "bk_draft";
/** Separate cookie so an admin edit does not clobber a client draft in the same browser. */
export const ADMIN_DRAFT_COOKIE = "bk_admin_draft";

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_MAX_AGE_SECONDS = DRAFT_TTL_MS / 1000;

const DRAFT_ID_RE = /^[A-Za-z0-9_-]{16}$/;

export type DraftScope = "client" | "admin";
export type DraftStep = "book" | "times";

export type SchedulingDraftInput = {
  address: string;
  placeId: string;
  services: string[];
  notes: string;
  modifyBookingId: string | null;
};

export type SchedulingDraft = SchedulingDraftInput & {
  id: string;
  scope: DraftScope;
  updatedAt: Date;
};

export type SchedulingFlowBooking = {
  address: string;
  notes?: string | null;
  services: readonly string[];
  updatedAt?: Date;
};

export type SchedulingFlowFields = {
  address: string;
  placeId: string;
  services: string[];
  notes: string;
};

export type LegacySchedulingQuery = {
  address?: string | string[] | null;
  placeId?: string | string[] | null;
  service?: string | string[] | null;
  notes?: string | string[] | null;
  modify?: string | null;
  error?: string | null;
  cancelled?: string | null;
};

const LIMITS = {
  address: 500,
  placeId: 300,
  notes: 2000,
  modify: 64,
  error: 240,
  cancelled: 40,
} as const;

export function draftCookieName(scope: DraftScope) {
  return scope === "admin" ? ADMIN_DRAFT_COOKIE : CLIENT_DRAFT_COOKIE;
}

export function draftCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DRAFT_MAX_AGE_SECONDS,
  };
}

export function isDraftId(value: string | null | undefined) {
  return DRAFT_ID_RE.test(String(value ?? ""));
}

export function firstQueryValue(value?: string | string[] | null) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "");
}

/** True when a book/modify URL still carries address, services, notes, or a place id. */
export function isLegacySchedulingQuery(params: LegacySchedulingQuery) {
  return [params.address, params.placeId, params.service, params.notes].some((value) =>
    (Array.isArray(value) ? value : value ? [value] : []).some((item) => String(item).trim()),
  );
}

export function clipQueryText(value: string | null | undefined, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
}

export function normalizeDraftInput(input: {
  address?: string | null;
  placeId?: string | null;
  services?: readonly string[] | null;
  notes?: string | null;
  modifyBookingId?: string | null;
}): SchedulingDraftInput {
  const modify = String(input.modifyBookingId ?? "").trim().slice(0, LIMITS.modify);
  return {
    address: String(input.address ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS.address),
    placeId: String(input.placeId ?? "").trim().slice(0, LIMITS.placeId),
    services: parseSchedulingServices(input.services ?? []),
    notes: String(input.notes ?? "").trim().slice(0, LIMITS.notes),
    modifyBookingId: modify || null,
  };
}

export function draftInputFromForm(form: Pick<FormData, "get" | "getAll">): SchedulingDraftInput {
  return normalizeDraftInput({
    address: String(form.get("address") ?? ""),
    placeId: String(form.get("placeId") ?? ""),
    services: form.getAll("service").map((value) => String(value)),
    notes: String(form.get("notes") ?? ""),
    modifyBookingId: String(form.get("modify") ?? form.get("bookingId") ?? ""),
  });
}

export function draftMatchesModify(draft: { modifyBookingId: string | null } | null, modifyId: string) {
  if (!draft) return false;
  return (draft.modifyBookingId ?? "") === modifyId.trim();
}

/**
 * Draft wins for the matching book/modify flow.
 * A saved booking newer than the draft (update completed, draft clear failed) wins instead.
 */
export function schedulingFlowFields(
  draft: SchedulingDraft | null,
  modifyId: string,
  booking: SchedulingFlowBooking | null,
): SchedulingFlowFields {
  const empty: SchedulingFlowFields = { address: "", placeId: "", services: [], notes: "" };
  const fromBooking = (): SchedulingFlowFields =>
    booking
      ? {
          address: booking.address,
          placeId: "",
          services: parseSchedulingServices(booking.services),
          notes: booking.notes?.trim() ?? "",
        }
      : empty;

  if (draft && draftMatchesModify(draft, modifyId)) {
    const bookingNewer =
      Boolean(booking?.updatedAt) &&
      Boolean(draft.updatedAt) &&
      booking!.updatedAt!.getTime() > draft.updatedAt.getTime();
    if (!bookingNewer) {
      return {
        address: draft.address,
        placeId: draft.placeId,
        services: draft.services,
        notes: draft.notes,
      };
    }
  }
  if (modifyId.trim() && booking) return fromBooking();
  return empty;
}

/** User-facing book or times path. Address, services, and notes stay out of the query. */
export function schedulingStepPath(input: {
  scope: DraftScope;
  to: DraftStep;
  modifyBookingId?: string | null;
  bookingId?: string | null;
  error?: string | null;
  cancelled?: string | null;
}) {
  const error = clipQueryText(input.error, LIMITS.error) || null;
  const cancelled = clipQueryText(input.cancelled, LIMITS.cancelled) || null;
  if (input.scope === "admin") {
    const id = String(input.bookingId ?? input.modifyBookingId ?? "").trim();
    if (!id) return ADMIN_BOOKINGS;
    return input.to === "times" ? adminBookingTimesHref(id, { error }) : adminBookingHref(id, { error });
  }
  const modify = String(input.modifyBookingId ?? "").trim() || null;
  return input.to === "times"
    ? schedulingTimesHref({ modify, error })
    : schedulingBookHref({ modify, error, cancelled });
}

/** Short hop that sets the draft cookie, then sends the browser to the clean path. */
export function draftAdoptPath(input: { id: string; to: DraftStep; error?: string | null; cancelled?: string | null }) {
  const query = new URLSearchParams();
  query.set("d", input.id);
  query.set("to", input.to);
  const error = clipQueryText(input.error, LIMITS.error);
  const cancelled = clipQueryText(input.cancelled, LIMITS.cancelled);
  if (error) query.set("error", error);
  if (cancelled) query.set("cancelled", cancelled);
  return `/api/scheduling/draft/adopt?${query.toString()}`;
}
