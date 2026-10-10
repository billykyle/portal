import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveClientBearer } from "./access";
import {
  describeAuthorize,
  exchangeToken,
  issueAuthorizationCode,
  readClientCredentials,
  registerOauthClient,
  revokeOauthToken,
} from "./flow";
import { hashToken, mcpResourceUrl, pkceS256 } from "./protocol";
import type {
  AccessView,
  AuthCodeRow,
  ClientConnectorStore,
  OauthClientRow,
  TokenRow,
} from "./types";

const ORIGIN = "https://portal.billy-kyle.com";
const RESOURCE = mcpResourceUrl(ORIGIN);
const NOW = new Date("2026-10-10T12:00:00.000Z");
const USER = "user-a";
const PORTAL = "client-a";

class MemoryStore implements ClientConnectorStore {
  clients = new Map<string, OauthClientRow>();
  codes = new Map<string, AuthCodeRow & { consumedAt: Date | null }>();
  tokens: TokenRow[] = [];
  access = new Map<string, boolean>([[PORTAL, true]]);
  members = new Set<string>([`${USER}:${PORTAL}`]);

  async insertOauthClient(row: OauthClientRow) {
    this.clients.set(row.id, row);
  }
  async getOauthClient(id: string) {
    return this.clients.get(id) ?? null;
  }
  async insertAuthCode(row: AuthCodeRow) {
    this.codes.set(row.codeHash, { ...row, consumedAt: null });
  }
  async consumeAuthCode(codeHash: string, now: Date) {
    const row = this.codes.get(codeHash);
    if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime()) return null;
    row.consumedAt = now;
    return row;
  }
  async insertToken(row: TokenRow) {
    this.tokens.push(row);
  }
  async findByAccessHash(hash: string) {
    const token = this.tokens.find((row) => row.accessTokenHash === hash);
    return token ? this.view(token) : null;
  }
  async findByRefreshHash(hash: string) {
    return this.tokens.find((row) => row.refreshTokenHash === hash) ?? null;
  }
  async findByPreviousRefreshHash(hash: string) {
    return this.tokens.find((row) => row.previousRefreshTokenHash === hash) ?? null;
  }
  async rotateToken(id: string, expectedRefreshHash: string, next: {
    accessTokenHash: string;
    refreshTokenHash: string;
    previousRefreshTokenHash: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
    now: Date;
  }) {
    const token = this.tokens.find((row) => row.id === id && row.refreshTokenHash === expectedRefreshHash && !row.revokedAt);
    if (!token) return false;
    token.accessTokenHash = next.accessTokenHash;
    token.refreshTokenHash = next.refreshTokenHash;
    token.previousRefreshTokenHash = next.previousRefreshTokenHash;
    token.accessExpiresAt = next.accessExpiresAt;
    token.refreshExpiresAt = next.refreshExpiresAt;
    token.lastUsedAt = next.now;
    return true;
  }
  async revokeToken(id: string, now: Date) {
    const token = this.tokens.find((row) => row.id === id);
    if (token && !token.revokedAt) token.revokedAt = now;
  }
  async revokePortalTokens(portalClientId: string, now: Date) {
    for (const token of this.tokens) {
      if (token.portalClientId === portalClientId && !token.revokedAt) token.revokedAt = now;
    }
  }
  async touchToken(id: string, now: Date) {
    const token = this.tokens.find((row) => row.id === id);
    if (token) token.lastUsedAt = now;
  }
  async agentAccessEnabled(portalClientId: string) {
    return this.access.get(portalClientId) === true;
  }
  async userCanActAs(userId: string, portalClientId: string) {
    return this.members.has(`${userId}:${portalClientId}`);
  }
  view(token: TokenRow): AccessView {
    return {
      ...token,
      email: "a@example.com",
      inviteCode: "BK00001",
      agentAccess: this.access.get(token.portalClientId) === true,
      member: this.members.has(`${token.userId}:${token.portalClientId}`),
    };
  }
}

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

async function registered(store: MemoryStore) {
  const result = await registerOauthClient(
    store,
    {
      client_name: "Listing assistant",
      redirect_uris: ["http://127.0.0.1:8787/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    NOW,
  );
  assert.equal(result.status, 201);
  const body = result.body as { client_id: string; client_name: string; client_secret?: string };
  assert.equal(body.client_name, "Listing assistant");
  assert.equal(body.client_secret, undefined);
  assert.equal(store.clients.get(body.client_id)?.secretHash, null);
  return body.client_id;
}

test("oauth code flow issues hashed tokens bound to the chosen client", async () => {
  const store = new MemoryStore();
  const clientId = await registered(store);
  const search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:8787/callback",
    code_challenge: pkceS256(VERIFIER),
    code_challenge_method: "S256",
    state: "xyz",
    resource: RESOURCE,
    scope: "client",
  });
  const described = await describeAuthorize(store, search, ORIGIN);
  assert.equal(described.ok, true);
  if (!described.ok) return;
  assert.equal(described.clientName, "Listing assistant");
  const issued = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: PORTAL,
    now: NOW,
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  const redirected = new URL(issued.redirectUrl);
  const code = redirected.searchParams.get("code") ?? "";
  assert.equal(redirected.searchParams.get("state"), "xyz");
  assert.equal(store.codes.has(hashToken(code)), true);
  assert.equal([...store.codes.values()].some((row) => row.codeHash === code), false);

  const token = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: VERIFIER,
      client_id: clientId,
      resource: RESOURCE,
    }),
    readClientCredentials(null, new URLSearchParams({ client_id: clientId })),
    NOW,
  );
  assert.equal(token.status, 200);
  const access = String((token.body as { access_token: string }).access_token);
  const refresh = String((token.body as { refresh_token: string }).refresh_token);
  assert.equal(store.tokens.some((row) => row.accessTokenHash === access), false);
  assert.equal(store.tokens[0]?.portalClientId, PORTAL);
  assert.equal(store.tokens[0]?.userId, USER);

  const reused = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: VERIFIER,
      client_id: clientId,
    }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal(reused.status, 400);
  assert.equal((reused.body as { error: string }).error, "invalid_grant");

  const authed = await resolveClientBearer(`Bearer ${access}`, store, RESOURCE, NOW);
  assert.equal(authed.ok, true);
  if (authed.ok) assert.equal(authed.context.clientId, PORTAL);

  const refreshed = await exchangeToken(
    store,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal(refreshed.status, 200);
  const nextAccess = String((refreshed.body as { access_token: string }).access_token);
  const stale = await exchangeToken(
    store,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal(stale.status, 400);
  assert.equal(store.tokens[0]?.revokedAt instanceof Date, true);

  const afterReuse = await resolveClientBearer(`Bearer ${nextAccess}`, store, RESOURCE, NOW);
  assert.equal(afterReuse.ok, false);
});

test("agent access off blocks consent, token exchange, and an existing bearer", async () => {
  const store = new MemoryStore();
  const clientId = await registered(store);
  store.access.set(PORTAL, false);
  const search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:8787/callback",
    code_challenge: pkceS256(VERIFIER),
    code_challenge_method: "S256",
    resource: RESOURCE,
  });
  const described = await describeAuthorize(store, search, ORIGIN);
  assert.equal(described.ok, true);
  if (!described.ok) return;
  const denied = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: PORTAL,
    now: NOW,
  });
  assert.equal(denied.ok, false);
  if (denied.ok) return;
  assert.match(denied.redirectUrl, /access_denied/);
  const deniedError = new URL(denied.redirectUrl).searchParams.get("error_description") ?? "";
  assert.match(deniedError, /turned off/);
  assert.equal(store.codes.size, 0);

  store.access.set(PORTAL, true);
  const issued = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: PORTAL,
    now: NOW,
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  const code = new URL(issued.redirectUrl).searchParams.get("code") ?? "";
  store.access.set(PORTAL, false);
  const blocked = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: VERIFIER,
      client_id: clientId,
    }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal(blocked.status, 400);

  store.access.set(PORTAL, true);
  const minted = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: "unused",
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: VERIFIER,
      client_id: clientId,
    }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal(minted.status, 400);

  const again = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: PORTAL,
    now: NOW,
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  const second = new URL(again.redirectUrl).searchParams.get("code") ?? "";
  const token = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: second,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: VERIFIER,
      client_id: clientId,
    }),
    { clientId, secret: null },
    NOW,
  );
  const access = String((token.body as { access_token: string }).access_token);
  store.access.set(PORTAL, false);
  const rejected = await resolveClientBearer(`Bearer ${access}`, store, RESOURCE, NOW);
  assert.equal(rejected.ok, false);
  assert.equal(store.tokens.at(-1)?.revokedAt instanceof Date, true);
  await store.revokePortalTokens(PORTAL, NOW);
  assert.ok(store.tokens.every((row) => row.portalClientId !== PORTAL || row.revokedAt));
});

test("wrong PKCE, wrong client, and revocation", async () => {
  const store = new MemoryStore();
  const clientId = await registered(store);
  const described = await describeAuthorize(
    store,
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_challenge: pkceS256(VERIFIER),
      code_challenge_method: "S256",
      resource: RESOURCE,
    }),
    ORIGIN,
  );
  assert.equal(described.ok, true);
  if (!described.ok) return;
  const issued = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: "client-b",
    now: NOW,
  });
  assert.equal(issued.ok, false);

  const owned = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: PORTAL,
    now: NOW,
  });
  assert.equal(owned.ok, true);
  if (!owned.ok) return;
  const code = new URL(owned.redirectUrl).searchParams.get("code") ?? "";
  const badPkce = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: `${VERIFIER.slice(0, -1)}A`,
      client_id: clientId,
    }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal((badPkce.body as { error: string }).error, "invalid_grant");

  const plain = await describeAuthorize(
    store,
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_challenge: pkceS256(VERIFIER),
      code_challenge_method: "plain",
      resource: RESOURCE,
    }),
    ORIGIN,
  );
  assert.equal(plain.ok, false);
  if (plain.ok || !plain.redirect) return;
  assert.match(plain.redirect, /invalid_request/);

  const fresh = await issueAuthorizationCode(store, {
    request: described.request,
    userId: USER,
    portalClientId: PORTAL,
    now: NOW,
  });
  assert.equal(fresh.ok, true);
  if (!fresh.ok) return;
  const nextCode = new URL(fresh.redirectUrl).searchParams.get("code") ?? "";
  const token = await exchangeToken(
    store,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: nextCode,
      redirect_uri: "http://127.0.0.1:8787/callback",
      code_verifier: VERIFIER,
      client_id: clientId,
    }),
    { clientId, secret: null },
    NOW,
  );
  const access = String((token.body as { access_token: string }).access_token);
  const revoked = await revokeOauthToken(
    store,
    new URLSearchParams({ token: access, client_id: clientId }),
    { clientId, secret: null },
    NOW,
  );
  assert.equal(revoked.status, 200);
  const after = await resolveClientBearer(`Bearer ${access}`, store, RESOURCE, NOW);
  assert.equal(after.ok, false);
});
