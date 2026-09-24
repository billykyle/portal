import { parseShootAddress } from "./address";
import type { AvailabilityResult } from "./availability";
import { parseSchedulingServices } from "./services";

export const AVAILABILITY_PREFETCH_DEBOUNCE_MS = 320;
export const AVAILABILITY_FRESH_MS = 90_000;

export type AvailabilityQuery = {
  address: string;
  placeId?: string | null;
  services: readonly string[];
  modify?: string | null;
};

export function canPrefetchAvailability(query: AvailabilityQuery) {
  if (parseSchedulingServices(query.services).length === 0) return false;
  return parseShootAddress(query.address).ok;
}

export function availabilityQueryKey(query: AvailabilityQuery) {
  const services = parseSchedulingServices(query.services).slice().sort();
  return JSON.stringify({
    address: String(query.address ?? "").replace(/\s+/g, " ").trim(),
    placeId: String(query.placeId ?? "").trim(),
    services,
    modify: String(query.modify ?? "").trim(),
  });
}

export function availabilitySearchParams(query: AvailabilityQuery) {
  const params = new URLSearchParams();
  const address = String(query.address ?? "").replace(/\s+/g, " ").trim();
  const placeId = String(query.placeId ?? "").trim();
  const modify = String(query.modify ?? "").trim();
  if (address) params.set("address", address);
  if (placeId) params.set("placeId", placeId);
  for (const service of parseSchedulingServices(query.services)) {
    params.append("service", service);
  }
  if (modify) params.set("modify", modify);
  return params;
}

export function isAvailabilityFresh(fetchedAt: number, now = Date.now(), maxAgeMs = AVAILABILITY_FRESH_MS) {
  return fetchedAt > 0 && now - fetchedAt < maxAgeMs;
}

/** Same-query refresh can keep its slots. Another address or service list must not. */
export function previousTimesForQuery(
  queryKey: string,
  lastGoodKey: string | null,
  lastGood: AvailabilityResult | null,
): AvailabilityResult | null {
  if (!lastGood || lastGoodKey !== queryKey) return null;
  return lastGood;
}

export function displayedTimesState(input: {
  loading: boolean;
  current: AvailabilityResult | null;
  previous: AvailabilityResult | null;
}) {
  const availability = input.current ?? input.previous;
  if (availability) {
    return {
      availability,
      refreshing: input.loading,
      stale: input.loading && !input.current,
      showLoadingScreen: false,
    };
  }
  return {
    availability: null,
    refreshing: input.loading,
    stale: false,
    showLoadingScreen: input.loading,
  };
}

export function readAvailabilityQuery(form: Pick<FormData, "get" | "getAll">): AvailabilityQuery {
  return {
    address: String(form.get("address") ?? ""),
    placeId: String(form.get("placeId") ?? ""),
    services: form.getAll("service").map((value) => String(value)),
    modify: String(form.get("modify") ?? form.get("bookingId") ?? ""),
  };
}
