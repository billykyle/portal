import type { AvailabilityResult } from "./availability";
import type { OfferedAvailabilityFailureKind } from "./load-offered-availability";
import {
  AVAILABILITY_FRESH_MS,
  availabilityQueryKey,
  availabilitySearchParams,
  canPrefetchAvailability,
  isAvailabilityFresh,
  type AvailabilityQuery,
} from "./times-prefetch";

export type AvailabilityResponse = {
  availability?: AvailabilityResult;
  error?: string;
  kind?: OfferedAvailabilityFailureKind;
};

type CacheEntry = {
  key: string;
  fetchedAt: number;
  result?: AvailabilityResponse;
  promise?: Promise<AvailabilityResponse>;
  controller?: AbortController;
};

const memory = new Map<string, CacheEntry>();
let inflight: CacheEntry | null = null;
let lastGood: { key: string; result: AvailabilityResult } | null = null;

export function peekAvailability(query: AvailabilityQuery): AvailabilityResult | null {
  const key = availabilityQueryKey(query);
  const entry = memory.get(key);
  if (entry?.result?.availability) return entry.result.availability;
  if (lastGood?.key === key) return lastGood.result;
  return null;
}

export function lastGoodAvailability(): AvailabilityResult | null {
  return lastGood?.result ?? null;
}

export function lastGoodAvailabilityKey(): string | null {
  return lastGood?.key ?? null;
}

export function resetAvailabilityCache() {
  for (const entry of memory.values()) {
    entry.controller?.abort();
  }
  memory.clear();
  inflight = null;
  lastGood = null;
}

export function requestAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
  const key = availabilityQueryKey(query);
  const existing = memory.get(key);
  if (existing?.result && isAvailabilityFresh(existing.fetchedAt)) {
    return Promise.resolve(existing.result);
  }
  if (existing?.promise) {
    return existing.promise;
  }

  if (inflight && inflight.key !== key) {
    inflight.controller?.abort();
    if (inflight.promise) {
      inflight.promise = undefined;
    }
    inflight = null;
  }

  const controller = new AbortController();
  const promise = fetchAvailability(query, controller.signal)
    .then((result) => {
      const entry: CacheEntry = { key, fetchedAt: Date.now(), result };
      memory.set(key, entry);
      if (result.availability && !result.error) {
        lastGood = { key, result: result.availability };
      }
      if (inflight?.controller === controller) inflight = null;
      return result;
    })
    .catch((error: unknown) => {
      const current = memory.get(key);
      if (current?.controller === controller) {
        memory.delete(key);
      }
      if (inflight?.controller === controller) inflight = null;
      if (isAbortError(error)) {
        return { error: "aborted", kind: "calendar" as const };
      }
      throw error;
    });

  const entry: CacheEntry = { key, fetchedAt: 0, promise, controller };
  memory.set(key, entry);
  inflight = entry;
  return promise;
}

export function prefetchAvailability(query: AvailabilityQuery) {
  if (!canPrefetchAvailability(query)) return Promise.resolve<AvailabilityResponse>({});
  return requestAvailability(query);
}

async function fetchAvailability(query: AvailabilityQuery, signal: AbortSignal): Promise<AvailabilityResponse> {
  const params = availabilitySearchParams(query);
  const res = await fetch(`/api/scheduling/availability?${params}`, {
    signal,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as AvailabilityResponse;
  if (!res.ok && res.status === 401) {
    return { error: "Sign in to load times.", kind: "address" };
  }
  if (body.availability || body.error) return body;
  if (!res.ok) {
    return { error: "Times cannot be loaded right now.", kind: "calendar" };
  }
  return body;
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError");
}

export { AVAILABILITY_FRESH_MS };
