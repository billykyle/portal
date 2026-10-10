import { and, eq, gt, isNull } from "drizzle-orm";
import { userBelongsToClient } from "@/lib/user-portals";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, oauthAuthCodes, oauthClients, oauthTokens, users } from "@/lib/db/schema";
import type {
  AccessView,
  AuthCodeRow,
  ClientConnectorStore,
  OauthAuthMethod,
  OauthClientRow,
  TokenRow,
} from "@/lib/client-agent/types";

function clientRow(row: typeof oauthClients.$inferSelect): OauthClientRow {
  return {
    id: row.id,
    secretHash: row.secretHash,
    name: row.name,
    redirectUris: row.redirectUris ?? [],
    authMethod: (row.authMethod === "client_secret_basic" || row.authMethod === "client_secret_post"
      ? row.authMethod
      : "none") as OauthAuthMethod,
    createdAt: row.createdAt,
  };
}

function tokenRow(row: typeof oauthTokens.$inferSelect): TokenRow {
  return {
    id: row.id,
    oauthClientId: row.oauthClientId,
    userId: row.userId,
    portalClientId: row.portalClientId,
    accessTokenHash: row.accessTokenHash,
    refreshTokenHash: row.refreshTokenHash,
    previousRefreshTokenHash: row.previousRefreshTokenHash,
    scope: row.scope,
    resource: row.resource,
    accessExpiresAt: row.accessExpiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export function postgresClientConnectorStore(): ClientConnectorStore {
  return {
    async insertOauthClient(row) {
      await ensureDb();
      await db.insert(oauthClients).values({
        id: row.id,
        secretHash: row.secretHash,
        name: row.name,
        redirectUris: row.redirectUris,
        authMethod: row.authMethod,
        createdAt: row.createdAt,
      });
    },
    async getOauthClient(id) {
      await ensureDb();
      const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
      return row ? clientRow(row) : null;
    },
    async insertAuthCode(row) {
      await ensureDb();
      await db.insert(oauthAuthCodes).values(row);
    },
    async consumeAuthCode(codeHash, now) {
      await ensureDb();
      const [row] = await db
        .update(oauthAuthCodes)
        .set({ consumedAt: now })
        .where(and(eq(oauthAuthCodes.codeHash, codeHash), isNull(oauthAuthCodes.consumedAt), gt(oauthAuthCodes.expiresAt, now)))
        .returning();
      if (!row) return null;
      const code: AuthCodeRow = {
        codeHash: row.codeHash,
        oauthClientId: row.oauthClientId,
        userId: row.userId,
        portalClientId: row.portalClientId,
        redirectUri: row.redirectUri,
        codeChallenge: row.codeChallenge,
        scope: row.scope,
        resource: row.resource,
        expiresAt: row.expiresAt,
      };
      return code;
    },
    async insertToken(row) {
      await ensureDb();
      await db.insert(oauthTokens).values(row);
    },
    async findByAccessHash(hash) {
      await ensureDb();
      const [row] = await db
        .select({
          token: oauthTokens,
          email: users.email,
          inviteCode: clients.inviteCode,
          agentAccess: clients.agentAccess,
        })
        .from(oauthTokens)
        .innerJoin(users, eq(users.id, oauthTokens.userId))
        .innerJoin(clients, eq(clients.id, oauthTokens.portalClientId))
        .where(eq(oauthTokens.accessTokenHash, hash))
        .limit(1);
      if (!row) return null;
      const view: AccessView = {
        ...tokenRow(row.token),
        email: row.email,
        inviteCode: row.inviteCode,
        agentAccess: row.agentAccess,
        member: await userBelongsToClient(row.token.userId, row.token.portalClientId),
      };
      return view;
    },
    async findByRefreshHash(hash) {
      await ensureDb();
      const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.refreshTokenHash, hash)).limit(1);
      return row ? tokenRow(row) : null;
    },
    async findByPreviousRefreshHash(hash) {
      await ensureDb();
      const [row] = await db
        .select()
        .from(oauthTokens)
        .where(eq(oauthTokens.previousRefreshTokenHash, hash))
        .limit(1);
      return row ? tokenRow(row) : null;
    },
    async rotateToken(id, expectedRefreshHash, next) {
      await ensureDb();
      const [row] = await db
        .update(oauthTokens)
        .set({
          accessTokenHash: next.accessTokenHash,
          refreshTokenHash: next.refreshTokenHash,
          previousRefreshTokenHash: next.previousRefreshTokenHash,
          accessExpiresAt: next.accessExpiresAt,
          refreshExpiresAt: next.refreshExpiresAt,
          lastUsedAt: next.now,
        })
        .where(
          and(eq(oauthTokens.id, id), eq(oauthTokens.refreshTokenHash, expectedRefreshHash), isNull(oauthTokens.revokedAt)),
        )
        .returning({ id: oauthTokens.id });
      return Boolean(row);
    },
    async revokeToken(id, now) {
      await ensureDb();
      await db
        .update(oauthTokens)
        .set({ revokedAt: now })
        .where(and(eq(oauthTokens.id, id), isNull(oauthTokens.revokedAt)));
    },
    async revokePortalTokens(portalClientId, now) {
      await ensureDb();
      await db
        .update(oauthTokens)
        .set({ revokedAt: now })
        .where(and(eq(oauthTokens.portalClientId, portalClientId), isNull(oauthTokens.revokedAt)));
    },
    async touchToken(id, now) {
      await ensureDb();
      await db.update(oauthTokens).set({ lastUsedAt: now }).where(eq(oauthTokens.id, id));
    },
    async agentAccessEnabled(portalClientId) {
      await ensureDb();
      const [row] = await db
        .select({ agentAccess: clients.agentAccess })
        .from(clients)
        .where(eq(clients.id, portalClientId))
        .limit(1);
      return row?.agentAccess === true;
    },
    async userCanActAs(userId, portalClientId) {
      return userBelongsToClient(userId, portalClientId);
    },
  };
}
