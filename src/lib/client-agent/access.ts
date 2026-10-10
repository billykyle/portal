import { bearerToken } from "@/lib/agent/auth";
import { hashToken, mcpResourceUrl } from "@/lib/client-agent/protocol";
import type { ClientConnectorStore } from "@/lib/client-agent/types";

export type ClientAgentContext = {
  tokenId: string;
  userId: string;
  email: string;
  clientId: string;
  inviteCode: string;
  resource: string;
};

export type ClientAccessResult =
  | { ok: true; context: ClientAgentContext }
  | { ok: false; status: 401; error: "invalid_token" | "invalid_request" };

export async function resolveClientBearer(
  authorization: string | null,
  store: Pick<ClientConnectorStore, "findByAccessHash" | "revokeToken" | "touchToken">,
  expectedResource: string,
  now = new Date(),
): Promise<ClientAccessResult> {
  const token = bearerToken(authorization);
  if (!token) return { ok: false, status: 401, error: "invalid_request" };
  const row = await store.findByAccessHash(hashToken(token));
  if (!row || row.revokedAt || row.accessExpiresAt.getTime() <= now.getTime() || row.resource !== expectedResource) {
    return { ok: false, status: 401, error: "invalid_token" };
  }
  if (!row.agentAccess || !row.member) {
    await store.revokeToken(row.id, now);
    return { ok: false, status: 401, error: "invalid_token" };
  }
  await store.touchToken(row.id, now);
  return {
    ok: true,
    context: {
      tokenId: row.id,
      userId: row.userId,
      email: row.email,
      clientId: row.portalClientId,
      inviteCode: row.inviteCode,
      resource: row.resource,
    },
  };
}

export function expectedMcpResource(request: Request) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]?.trim();
  if (!host) return mcpResourceUrl(new URL(request.url).origin);
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwarded || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return mcpResourceUrl(`${proto}://${host}`);
}
