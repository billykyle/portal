import {
  ACCESS_TOKEN_TTL_SEC,
  AUTH_CODE_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  canonicalUrl,
  hashToken,
  mcpResourceUrl,
  newToken,
  normalizeScope,
  oauthError,
  oauthRedirect,
  secretMatches,
  pkceMatches,
  validCodeChallenge,
  validRedirectUri,
  type OauthErrorBody,
} from "@/lib/client-agent/protocol";
import type { AuthorizeRequest, ClientConnectorStore, OauthAuthMethod, OauthClientRow } from "@/lib/client-agent/types";

export type OauthResult = { status: number; body: OauthErrorBody | Record<string, unknown> };

const AUTH_METHODS = new Set<OauthAuthMethod>(["none", "client_secret_basic", "client_secret_post"]);

function plusSeconds(now: Date, seconds: number) {
  return new Date(now.getTime() + seconds * 1000);
}

export async function registerOauthClient(
  store: ClientConnectorStore,
  body: unknown,
  now = new Date(),
): Promise<OauthResult> {
  if (!body || typeof body !== "object") {
    return { status: 400, body: oauthError("invalid_client_metadata", "Registration body must be a JSON object.") };
  }
  const record = body as Record<string, unknown>;
  const rawUris = Array.isArray(record.redirect_uris) ? record.redirect_uris : null;
  if (!rawUris || rawUris.length === 0 || rawUris.length > 10) {
    return { status: 400, body: oauthError("invalid_redirect_uri", "Send one to ten redirect URIs.") };
  }
  const redirectUris = rawUris.map((value) => String(value ?? "").trim());
  if (redirectUris.some((uri) => !validRedirectUri(uri))) {
    return {
      status: 400,
      body: oauthError("invalid_redirect_uri", "Redirect URIs must be https, loopback http, or a private app scheme."),
    };
  }
  const requestedMethod = String(record.token_endpoint_auth_method ?? "none");
  if (!AUTH_METHODS.has(requestedMethod as OauthAuthMethod)) {
    return { status: 400, body: oauthError("invalid_client_metadata", "Unsupported token endpoint auth method.") };
  }
  const authMethod = requestedMethod as OauthAuthMethod;
  const responseTypes = Array.isArray(record.response_types) ? record.response_types.map(String) : ["code"];
  if (responseTypes.some((type) => type !== "code")) {
    return { status: 400, body: oauthError("invalid_client_metadata", "Only the authorization code response type is supported.") };
  }
  const grantTypes = Array.isArray(record.grant_types) ? record.grant_types.map(String) : ["authorization_code", "refresh_token"];
  if (!grantTypes.includes("authorization_code")) {
    return { status: 400, body: oauthError("invalid_client_metadata", "authorization_code is required.") };
  }
  if (grantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) {
    return { status: 400, body: oauthError("invalid_client_metadata", "Unsupported grant type.") };
  }
  const name = String(record.client_name ?? "Client agent").trim().slice(0, 120) || "Client agent";
  const secret = authMethod === "none" ? null : newToken("bks");
  const client: OauthClientRow = {
    id: newToken("bkcli"),
    secretHash: secret ? hashToken(secret) : null,
    name,
    redirectUris,
    authMethod,
    createdAt: now,
  };
  await store.insertOauthClient(client);
  return {
    status: 201,
    body: {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: client.authMethod,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
  };
}

export type AuthorizeDecision =
  | { ok: true; clientName: string; request: AuthorizeRequest }
  | { ok: false; message: string; redirect?: string };

export async function describeAuthorize(
  store: ClientConnectorStore,
  search: URLSearchParams,
  origin: string,
): Promise<AuthorizeDecision> {
  const clientId = search.get("client_id")?.trim() ?? "";
  const redirectUri = search.get("redirect_uri")?.trim() ?? "";
  if (!clientId) return { ok: false, message: "This connection request is missing a client id." };
  const client = await store.getOauthClient(clientId);
  if (!client) return { ok: false, message: "This connection request is not valid." };
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, message: "This connection request has an unregistered redirect URI." };
  }
  const fail = (error: string, description: string): AuthorizeDecision => ({
    ok: false,
    message: description,
    redirect: oauthRedirect(redirectUri, {
      error,
      error_description: description,
      state: search.get("state"),
    }),
  });
  if ((search.get("response_type") ?? "code") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  if ((search.get("code_challenge_method") ?? "") !== "S256") {
    return fail("invalid_request", "PKCE S256 is required.");
  }
  const challenge = search.get("code_challenge")?.trim() ?? "";
  if (!validCodeChallenge(challenge)) {
    return fail("invalid_request", "code_challenge is missing or invalid.");
  }
  const scope = normalizeScope(search.get("scope"));
  if (!scope) return fail("invalid_scope", "The only scope is client.");
  const expected = mcpResourceUrl(origin);
  const rawResource = search.get("resource")?.trim() ?? "";
  const resource = rawResource ? canonicalUrl(rawResource) : expected;
  if (!resource || resource !== expected) {
    return fail("invalid_target", "resource must be this portal's client connector.");
  }
  return {
    ok: true,
    clientName: client.name,
    request: {
      clientId,
      redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      state: search.get("state"),
      scope,
      resource,
    },
  };
}

export async function issueAuthorizationCode(
  store: ClientConnectorStore,
  input: { request: AuthorizeRequest; userId: string; portalClientId: string; now?: Date },
): Promise<{ ok: true; redirectUrl: string } | { ok: false; redirectUrl: string }> {
  const now = input.now ?? new Date();
  const { request } = input;
  const deny = (description: string) => ({
    ok: false as const,
    redirectUrl: oauthRedirect(request.redirectUri, {
      error: "access_denied",
      error_description: description,
      state: request.state,
    }),
  });
  if (!(await store.userCanActAs(input.userId, input.portalClientId))) {
    return deny("That client is not on this login.");
  }
  if (!(await store.agentAccessEnabled(input.portalClientId))) {
    return deny("Agent access is turned off for this client.");
  }
  const code = newToken("bkc");
  await store.insertAuthCode({
    codeHash: hashToken(code),
    oauthClientId: request.clientId,
    userId: input.userId,
    portalClientId: input.portalClientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    resource: request.resource,
    expiresAt: plusSeconds(now, AUTH_CODE_TTL_SEC),
  });
  return {
    ok: true,
    redirectUrl: oauthRedirect(request.redirectUri, { code, state: request.state }),
  };
}

export type ClientCredentials = { clientId: string; secret: string | null };

export function readClientCredentials(authorization: string | null, body: URLSearchParams): ClientCredentials | null {
  const basic = readBasic(authorization);
  if (basic) return basic;
  const clientId = body.get("client_id")?.trim() ?? "";
  if (!clientId) return null;
  const secret = body.get("client_secret");
  return { clientId, secret: secret == null || secret === "" ? null : secret };
}

function readBasic(authorization: string | null): ClientCredentials | null {
  if (!authorization) return null;
  const match = /^Basic\s+(\S+)\s*$/i.exec(authorization.trim());
  if (!match) return null;
  let decoded = "";
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep <= 0) return null;
  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, sep)),
      secret: decodeURIComponent(decoded.slice(sep + 1)) || null,
    };
  } catch {
    return null;
  }
}

async function authenticateClient(store: ClientConnectorStore, credentials: ClientCredentials | null) {
  if (!credentials) return { ok: false as const, status: 401, body: oauthError("invalid_client", "Client authentication failed.") };
  const client = await store.getOauthClient(credentials.clientId);
  if (!client) return { ok: false as const, status: 401, body: oauthError("invalid_client", "Client authentication failed.") };
  if (client.secretHash) {
    if (!credentials.secret || !secretMatches(credentials.secret, client.secretHash)) {
      return { ok: false as const, status: 401, body: oauthError("invalid_client", "Client authentication failed.") };
    }
  }
  return { ok: true as const, client };
}

function tokenBody(input: { access: string; refresh: string; scope: string; expiresIn: number }) {
  return {
    access_token: input.access,
    token_type: "Bearer",
    expires_in: input.expiresIn,
    refresh_token: input.refresh,
    scope: input.scope,
  };
}

export async function exchangeToken(
  store: ClientConnectorStore,
  body: URLSearchParams,
  credentials: ClientCredentials | null,
  now = new Date(),
): Promise<OauthResult> {
  const auth = await authenticateClient(store, credentials);
  if (!auth.ok) return auth;
  const grant = body.get("grant_type") ?? "";
  if (grant === "authorization_code") return exchangeCode(store, auth.client, body, now);
  if (grant === "refresh_token") return exchangeRefresh(store, auth.client, body, now);
  return { status: 400, body: oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.") };
}

async function exchangeCode(
  store: ClientConnectorStore,
  client: OauthClientRow,
  body: URLSearchParams,
  now: Date,
): Promise<OauthResult> {
  const code = body.get("code")?.trim() ?? "";
  const redirectUri = body.get("redirect_uri")?.trim() ?? "";
  const verifier = body.get("code_verifier")?.trim() ?? "";
  if (!code || !redirectUri || !verifier) {
    return { status: 400, body: oauthError("invalid_request", "code, redirect_uri, and code_verifier are required.") };
  }
  const row = await store.consumeAuthCode(hashToken(code), now);
  if (!row || row.oauthClientId !== client.id || row.redirectUri !== redirectUri) {
    return { status: 400, body: oauthError("invalid_grant", "Authorization code is invalid or expired.") };
  }
  if (!pkceMatches(verifier, row.codeChallenge)) {
    return { status: 400, body: oauthError("invalid_grant", "PKCE verification failed.") };
  }
  const resource = body.get("resource")?.trim();
  if (resource && canonicalUrl(resource) !== row.resource) {
    return { status: 400, body: oauthError("invalid_target", "resource does not match the authorization request.") };
  }
  if (!(await store.agentAccessEnabled(row.portalClientId)) || !(await store.userCanActAs(row.userId, row.portalClientId))) {
    return { status: 400, body: oauthError("invalid_grant", "Agent access is turned off for this client.") };
  }
  const issued = await issueTokenPair(store, {
    oauthClientId: client.id,
    userId: row.userId,
    portalClientId: row.portalClientId,
    scope: row.scope,
    resource: row.resource,
    now,
  });
  return { status: 200, body: tokenBody({ ...issued, scope: row.scope, expiresIn: ACCESS_TOKEN_TTL_SEC }) };
}

async function exchangeRefresh(
  store: ClientConnectorStore,
  client: OauthClientRow,
  body: URLSearchParams,
  now: Date,
): Promise<OauthResult> {
  const refresh = body.get("refresh_token")?.trim() ?? "";
  if (!refresh) return { status: 400, body: oauthError("invalid_request", "refresh_token is required.") };
  const hash = hashToken(refresh);
  const row = await store.findByRefreshHash(hash);
  if (!row || row.oauthClientId !== client.id || row.revokedAt || row.refreshExpiresAt.getTime() <= now.getTime()) {
    const reused = await store.findByPreviousRefreshHash(hash);
    if (reused && reused.oauthClientId === client.id) await store.revokeToken(reused.id, now);
    return { status: 400, body: oauthError("invalid_grant", "Refresh token is invalid or expired.") };
  }
  if (!(await store.agentAccessEnabled(row.portalClientId)) || !(await store.userCanActAs(row.userId, row.portalClientId))) {
    await store.revokeToken(row.id, now);
    return { status: 400, body: oauthError("invalid_grant", "Agent access is turned off for this client.") };
  }
  const scope = normalizeScope(body.get("scope") ?? row.scope);
  if (!scope || scope !== row.scope) return { status: 400, body: oauthError("invalid_scope", "The only scope is client.") };
  const access = newToken("bka");
  const nextRefresh = newToken("bkr");
  const rotated = await store.rotateToken(row.id, hash, {
    accessTokenHash: hashToken(access),
    refreshTokenHash: hashToken(nextRefresh),
    previousRefreshTokenHash: hash,
    accessExpiresAt: plusSeconds(now, ACCESS_TOKEN_TTL_SEC),
    refreshExpiresAt: plusSeconds(now, REFRESH_TOKEN_TTL_SEC),
    now,
  });
  if (!rotated) return { status: 400, body: oauthError("invalid_grant", "Refresh token is invalid or expired.") };
  return { status: 200, body: tokenBody({ access, refresh: nextRefresh, scope, expiresIn: ACCESS_TOKEN_TTL_SEC }) };
}

async function issueTokenPair(
  store: ClientConnectorStore,
  input: { oauthClientId: string; userId: string; portalClientId: string; scope: string; resource: string; now: Date },
) {
  const access = newToken("bka");
  const refresh = newToken("bkr");
  await store.insertToken({
    id: crypto.randomUUID(),
    oauthClientId: input.oauthClientId,
    userId: input.userId,
    portalClientId: input.portalClientId,
    accessTokenHash: hashToken(access),
    refreshTokenHash: hashToken(refresh),
    previousRefreshTokenHash: null,
    scope: input.scope,
    resource: input.resource,
    accessExpiresAt: plusSeconds(input.now, ACCESS_TOKEN_TTL_SEC),
    refreshExpiresAt: plusSeconds(input.now, REFRESH_TOKEN_TTL_SEC),
    revokedAt: null,
    createdAt: input.now,
    lastUsedAt: null,
  });
  return { access, refresh };
}

export async function revokeOauthToken(
  store: ClientConnectorStore,
  body: URLSearchParams,
  credentials: ClientCredentials | null,
  now = new Date(),
): Promise<OauthResult> {
  const auth = await authenticateClient(store, credentials);
  if (!auth.ok) return auth;
  const token = body.get("token")?.trim() ?? "";
  if (!token) return { status: 200, body: {} };
  const hash = hashToken(token);
  const access = await store.findByAccessHash(hash);
  const refresh = access ? null : await store.findByRefreshHash(hash);
  const previous = access || refresh ? null : await store.findByPreviousRefreshHash(hash);
  const row = access ?? refresh ?? previous;
  if (row && row.oauthClientId === auth.client.id) await store.revokeToken(row.id, now);
  return { status: 200, body: {} };
}
