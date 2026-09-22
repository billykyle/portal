import { ADMIN_BOOKINGS, CLIENT_SCHEDULING, CLIENT_SCHEDULING_CONFIRMED, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

/** Short query flags only. Address, services, and notes live on the booking draft. */
export type SchedulingQuery = {
  error?: string | null;
  cancelled?: string | null;
  modify?: string | null;
};

export function schedulingSearch(params: SchedulingQuery = {}) {
  const query = new URLSearchParams();
  if (params.error) query.set("error", params.error);
  if (params.cancelled) query.set("cancelled", params.cancelled);
  if (params.modify) query.set("modify", params.modify);
  return query.toString();
}

export function schedulingHref(path: string, params: SchedulingQuery = {}) {
  const qs = schedulingSearch(params);
  return qs ? `${path}?${qs}` : path;
}

export function schedulingBookHref(params: SchedulingQuery = {}) {
  return schedulingHref(CLIENT_SCHEDULING, params);
}

export function schedulingTimesHref(params: SchedulingQuery = {}) {
  return schedulingHref(CLIENT_SCHEDULING_TIMES, params);
}

export function adminBookingHref(bookingId: string, params: Pick<SchedulingQuery, "error"> = {}) {
  return schedulingHref(`${ADMIN_BOOKINGS}/${bookingId}`, params);
}

export function adminBookingTimesHref(bookingId: string, params: Pick<SchedulingQuery, "error"> = {}) {
  return schedulingHref(`${ADMIN_BOOKINGS}/${bookingId}/times`, params);
}

/** Link back to the address and services step without putting the form in the query. */
export function schedulingEditorHref(input: {
  fromAdmin?: boolean;
  bookingId?: string | null;
  error?: string | null;
}) {
  if (input.fromAdmin && input.bookingId) {
    return adminBookingHref(input.bookingId, { error: input.error });
  }
  return schedulingBookHref({ modify: input.bookingId, error: input.error });
}

export function schedulingConfirmedHref(
  bookingId: string,
  options?: { updated?: boolean; cancelled?: boolean; calendar?: "failed"; email?: "failed" },
) {
  const path = `${CLIENT_SCHEDULING_CONFIRMED}/${bookingId}`;
  const query = new URLSearchParams();
  if (options?.cancelled) query.set("cancelled", "1");
  if (options?.updated) query.set("updated", "1");
  if (options?.calendar === "failed") query.set("calendar", "failed");
  if (options?.email === "failed") query.set("email", "failed");
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Client cancel always lands here so the URL changes even from the same confirm page. */
export function schedulingCancelConfirmHref(
  bookingId: string,
  options?: { calendar?: "failed"; email?: "failed" },
) {
  return schedulingConfirmedHref(bookingId, { cancelled: true, ...options });
}
