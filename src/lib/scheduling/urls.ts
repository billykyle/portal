import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_CONFIRMED, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

export type SchedulingQuery = {
  address?: string | null;
  placeId?: string | null;
  services?: readonly string[] | null;
  notes?: string | null;
  error?: string | null;
  cancelled?: string | null;
  modify?: string | null;
};

export function schedulingSearch(params: SchedulingQuery) {
  const query = new URLSearchParams();
  if (params.address) query.set("address", params.address);
  if (params.placeId) query.set("placeId", params.placeId);
  for (const service of params.services ?? []) {
    query.append("service", service);
  }
  const notes = params.notes?.trim();
  if (notes) query.set("notes", notes);
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

export function schedulingConfirmedHref(bookingId: string, options?: { updated?: boolean }) {
  const path = `${CLIENT_SCHEDULING_CONFIRMED}/${bookingId}`;
  return options?.updated ? `${path}?updated=1` : path;
}
