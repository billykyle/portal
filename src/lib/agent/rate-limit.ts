type Bucket = { count: number; resetAt: number };

type GlobalRate = typeof globalThis & { __portalAgentRate?: Map<string, Bucket> };

function buckets() {
  const g = globalThis as GlobalRate;
  if (!g.__portalAgentRate) g.__portalAgentRate = new Map();
  return g.__portalAgentRate;
}

export const AGENT_RATE_LIMIT = 120;
export const AGENT_RATE_WINDOW_MS = 60_000;

export function resetAgentRateForTests() {
  buckets().clear();
}

export function consumeAgentRate(
  key: string,
  now = Date.now(),
  limit = AGENT_RATE_LIMIT,
  windowMs = AGENT_RATE_WINDOW_MS,
) {
  const map = buckets();
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, retryAfterSec: 0 };
  }
  current.count += 1;
  if (current.count > limit) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  return { ok: true as const, retryAfterSec: 0 };
}

export function agentClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "local";
}
