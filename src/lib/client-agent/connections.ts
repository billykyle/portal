import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clientAgentCalls, oauthClients, oauthTokens, users } from "@/lib/db/schema";
import { postgresClientConnectorStore } from "@/lib/client-agent/pg-store";

export type ConnectedAgent = {
  tokenId: string;
  agentName: string;
  userEmail: string;
  connectedAt: Date;
  lastUsedAt: Date | null;
};

export type AgentActivity = {
  id: string;
  tool: string;
  summary: string;
  ok: boolean;
  createdAt: Date;
};

export async function listConnectedAgents(portalClientId: string): Promise<ConnectedAgent[]> {
  await ensureDb();
  const now = new Date();
  const rows = await db
    .select({
      tokenId: oauthTokens.id,
      agentName: oauthClients.name,
      userEmail: users.email,
      connectedAt: oauthTokens.createdAt,
      lastUsedAt: oauthTokens.lastUsedAt,
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthTokens.oauthClientId))
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(
      and(eq(oauthTokens.portalClientId, portalClientId), isNull(oauthTokens.revokedAt), gt(oauthTokens.refreshExpiresAt, now)),
    )
    .orderBy(desc(oauthTokens.createdAt));
  return rows;
}

export async function listAgentActivity(portalClientId: string, limit = 50): Promise<AgentActivity[]> {
  await ensureDb();
  return db
    .select({
      id: clientAgentCalls.id,
      tool: clientAgentCalls.tool,
      summary: clientAgentCalls.summary,
      ok: clientAgentCalls.ok,
      createdAt: clientAgentCalls.createdAt,
    })
    .from(clientAgentCalls)
    .where(eq(clientAgentCalls.portalClientId, portalClientId))
    .orderBy(desc(clientAgentCalls.createdAt))
    .limit(limit);
}

export async function revokePortalAgentTokens(portalClientId: string) {
  await postgresClientConnectorStore().revokePortalTokens(portalClientId, new Date());
}

export async function revokeOneAgentToken(portalClientId: string, tokenId: string) {
  await ensureDb();
  const [row] = await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokens.id, tokenId), eq(oauthTokens.portalClientId, portalClientId), isNull(oauthTokens.revokedAt)))
    .returning({ id: oauthTokens.id });
  return Boolean(row);
}
