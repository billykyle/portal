import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const CLIENT_SCOPE = "client";
export const CLIENT_MCP_PATH = "/api/client/mcp";
export const AUTH_CODE_TTL_SEC = 10 * 60;
export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

const BLOCKED_REDIRECT_PROTOCOLS = new Set(["javascript", "data", "file", "blob", "vbscript"]);

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function secretMatches(provided: string, expectedHash: string) {
  const actual = hashToken(provided);
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) {
    timingSafeEqual(right, Buffer.alloc(right.length));
    return false;
  }
  return timingSafeEqual(left, right);
}

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(verifier))). */
export function pkceS256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function validCodeVerifier(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function pkceMatches(verifier: string, challenge: string) {
  if (!validCodeVerifier(verifier)) return false;
  const actual = pkceS256(verifier);
  const left = Buffer.from(actual);
  const right = Buffer.from(challenge);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function validCodeChallenge(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function validRedirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  const protocol = url.protocol.replace(/:$/, "").toLowerCase();
  if (BLOCKED_REDIRECT_PROTOCOLS.has(protocol)) return false;
  if (protocol === "https") return true;
  if (protocol === "http") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  }
  return /^[a-z][a-z0-9+.-]*$/.test(protocol);
}

export function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function mcpResourceUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}${CLIENT_MCP_PATH}`;
}

export function normalizeScope(raw: string | null | undefined) {
  const parts = String(raw ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return CLIENT_SCOPE;
  if (parts.every((part) => part === CLIENT_SCOPE)) return CLIENT_SCOPE;
  return null;
}

export function authorizationServerMetadata(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    scopes_supported: [CLIENT_SCOPE],
    response_modes_supported: ["query"],
  };
}

export function protectedResourceMetadata(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    resource: mcpResourceUrl(base),
    authorization_servers: [base],
    scopes_supported: [CLIENT_SCOPE],
    bearer_methods_supported: ["header"],
  };
}

export function wwwAuthenticate(origin: string, error?: "invalid_token" | "invalid_request") {
  const metadata = `${origin.replace(/\/$/, "")}/.well-known/oauth-protected-resource/api/client/mcp`;
  const parts = [`Bearer realm="billy-kyle-client"`, `resource_metadata="${metadata}"`];
  if (error) parts.push(`error="${error}"`);
  return parts.join(", ");
}

export function externalOrigin(request: Request) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    ?.trim();
  if (!host) return new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwarded || (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") ? "http" : "https");
  return `${proto}://${host}`;
}

export function oauthRedirect(redirectUri: string, params: Record<string, string | null | undefined>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Only an in-app authorize URL may be used as a post-login return. */
export function safeOauthReturn(value: string) {
  const text = value.trim();
  if (!text.startsWith("/oauth/authorize?")) return null;
  if (text.length > 4000 || /[\s\\]/.test(text) || text.includes("//")) return null;
  try {
    const url = new URL(text, "http://localhost");
    if (url.origin !== "http://localhost" || url.pathname !== "/oauth/authorize") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function clipSummary(value: string, max = 240) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export type OauthErrorBody = { error: string; error_description?: string };

export function oauthError(error: string, description: string): OauthErrorBody {
  return { error, error_description: description };
}
