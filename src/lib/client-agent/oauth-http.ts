import {
  exchangeToken,
  readClientCredentials,
  registerOauthClient,
  revokeOauthToken,
} from "@/lib/client-agent/flow";
import { authorizationServerMetadata, externalOrigin, protectedResourceMetadata } from "@/lib/client-agent/protocol";
import type { ClientConnectorStore } from "@/lib/client-agent/types";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept",
  "cache-control": "no-store",
};

export function oauthJson(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export function oauthOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export function metadataResponse(kind: "authorization" | "resource", request: Request) {
  const origin = externalOrigin(request);
  const body = kind === "authorization" ? authorizationServerMetadata(origin) : protectedResourceMetadata(origin);
  return oauthJson(body, 200);
}

export async function readOauthForm(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        params.set(key, String(value));
      }
    }
    return params;
  }
  return new URLSearchParams(await request.text());
}

export async function handleRegister(request: Request, store: ClientConnectorStore) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthJson({ error: "invalid_client_metadata", error_description: "Registration body must be JSON." }, 400);
  }
  const result = await registerOauthClient(store, body);
  return oauthJson(result.body, result.status);
}

export async function handleToken(request: Request, store: ClientConnectorStore) {
  const body = await readOauthForm(request);
  const credentials = readClientCredentials(request.headers.get("authorization"), body);
  const result = await exchangeToken(store, body, credentials);
  return oauthJson(result.body, result.status);
}

export async function handleRevoke(request: Request, store: ClientConnectorStore) {
  const body = await readOauthForm(request);
  const credentials = readClientCredentials(request.headers.get("authorization"), body);
  const result = await revokeOauthToken(store, body, credentials);
  return oauthJson(result.body, result.status);
}
