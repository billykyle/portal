import { isNasUnreachableError, readableNasError } from "@/lib/nas-connect";

/**
 * Decide which admin-clients string is a NAS sync failure.
 * The relay's own "connect to device timeout" must not render as-is,
 * including a stale ?error= banner from before the sync section had its own param.
 */
export function nasSyncPageNotice(input: { error?: string; syncError?: string }) {
  const pageRaw = input.error?.trim() ?? "";
  const syncRaw = input.syncError?.trim() ?? "";
  const pageIsNas = pageRaw.length > 0 && isNasUnreachableError(pageRaw);
  const rawSync = syncRaw || (pageIsNas ? pageRaw : "");
  return {
    topError: pageIsNas ? "" : pageRaw,
    syncError: rawSync ? readableNasError(rawSync) : "",
  };
}
