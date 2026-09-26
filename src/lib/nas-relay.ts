import { NAS_CONNECT_TIMEOUT_MS, nasConnectInit } from "@/lib/nas-connect";

/** UGREENlink asks this which relay currently has the device. */
export const UGREEN_NODE_INFO_URL = "https://api.ugnas.com/api/p2p/v2/ta/nodeInfo/byAlias";

/**
 * UGREENlink id from a regional host (`10128873.us15.ug.link`) or a share URL
 * (`https://ug.link/10128873/filemgr/...`).
 */
export function ugreenLinkAlias(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const regional = host.match(/^(\d+)\.[a-z0-9-]+\.ug\.link$/);
  if (regional) return regional[1];
  if (host === "ug.link" || host === "www.ug.link") {
    const segment = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (/^\d+$/.test(segment)) return segment;
  }
  return null;
}

export function relayOriginFromNodeInfo(alias: string, body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as { code?: number; data?: { relayDomain?: unknown } };
  if (record.code !== 200) return null;
  const domain = typeof record.data?.relayDomain === "string" ? record.data.relayDomain.trim() : "";
  if (!/^[a-z0-9.-]+$/i.test(domain)) return null;
  return `https://${alias}.${domain}`.replace(/\/+$/, "");
}

export function nasHostsMatch(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  try {
    const a = new URL(left.includes("://") ? left : `https://${left}`);
    const b = new URL(right.includes("://") ? right : `https://${right}`);
    return a.origin === b.origin;
  } catch {
    return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
  }
}

/** A stored share cookie is only good for the relay that issued it. */
export function shareSessionMatchesRelay(
  session: { host: string; cookie: string } | null | undefined,
  relayHost: string | null | undefined,
  failedCookie?: string,
) {
  if (!session?.cookie || !session.host) return false;
  if (failedCookie && session.cookie === failedCookie) return false;
  if (!relayHost) return true;
  return nasHostsMatch(session.host, relayHost);
}

export async function discoverUgreenRelayOrigin(
  alias: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = NAS_CONNECT_TIMEOUT_MS,
) {
  const res = await fetchImpl(
    UGREEN_NODE_INFO_URL,
    nasConnectInit({
      method: "POST",
      headers: {
        "content-type": "application/json",
        referer: "https://www.ug.link/",
      },
      body: JSON.stringify({ alias }),
      signal: AbortSignal.timeout(timeoutMs),
    }),
  );
  const body: unknown = await res.json();
  return relayOriginFromNodeInfo(alias, body);
}
