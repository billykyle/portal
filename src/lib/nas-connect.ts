/** How long one attempt may wait for the UGOS relay to reach the NAS. */
export const NAS_CONNECT_TIMEOUT_MS = 15_000;

/**
 * Cold disks report the same "connect to device timeout" as a dead relay.
 * First file call waits longer, then two more tries with pauses.
 * 30s + 8s + 22s + 8s + 20s = 88s, under the 300s function limit.
 */
export const NAS_WAKE_PLAN = [
  { timeoutMs: 30_000, backoffMs: 8_000 },
  { timeoutMs: 22_000, backoffMs: 8_000 },
  { timeoutMs: 20_000, backoffMs: 0 },
] as const;

export function nasWakeBudgetMs() {
  return NAS_WAKE_PLAN.reduce((sum, step) => sum + step.timeoutMs + step.backoffMs, 0);
}

export const NAS_UNREACHABLE_MESSAGE = "Couldn't reach the NAS. Check that it's on and reachable.";

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

/**
 * The UGOS / ug.link relay answers with "connect to device timeout" when it
 * cannot reach the NAS. A hung socket shows up as a fetch timeout instead.
 */
export function isNasUnreachableError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const lower = errorText(error).toLowerCase();
  return (
    lower.includes("connect to device timeout") ||
    lower.includes("the operation was aborted") ||
    lower.includes("aborted due to timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("und_err_connect_timeout") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("eai_again")
  );
}

/** Same sentence for the admin button and the MCP tool. Other failures stay specific. */
export function readableNasError(error: unknown) {
  if (isNasUnreachableError(error)) return NAS_UNREACHABLE_MESSAGE;
  const message = errorText(error).trim();
  return message || "NAS sync failed.";
}

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wake a sleeping NAS: one longer first request, then retries with pauses.
 * Stops at nasWakeBudgetMs(). A wrong password is not retried.
 */
export async function withNasWake<T>(
  run: (timeoutMs: number) => Promise<T>,
  options: {
    sleep?: (ms: number) => Promise<void>;
    onUnreachable?: () => void;
  } = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let last: unknown;
  for (let index = 0; index < NAS_WAKE_PLAN.length; index += 1) {
    const step = NAS_WAKE_PLAN[index];
    try {
      return await run(step.timeoutMs);
    } catch (error) {
      last = error;
      const more = index < NAS_WAKE_PLAN.length - 1;
      if (!isNasUnreachableError(error) || !more) throw error;
      options.onUnreachable?.();
      if (step.backoffMs > 0) await sleep(step.backoffMs);
    }
  }
  throw last instanceof Error ? last : new Error(NAS_UNREACHABLE_MESSAGE);
}

/** Run a connect attempt, then one more if the NAS or relay did not answer. */
export async function withNasConnectRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isNasUnreachableError(error)) throw error;
    return await run();
  }
}

/** Fetch options with a connect deadline. Callers that pass a signal keep it. */
export function nasConnectInit(init: RequestInit = {}): RequestInit {
  return {
    cache: "no-store",
    ...init,
    signal: init.signal ?? AbortSignal.timeout(NAS_CONNECT_TIMEOUT_MS),
  };
}
