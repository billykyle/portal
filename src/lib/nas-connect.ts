/** How long one attempt may wait for the UGOS relay to reach the NAS. */
export const NAS_CONNECT_TIMEOUT_MS = 15_000;

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
