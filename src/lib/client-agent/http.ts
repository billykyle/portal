import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { expectedMcpResource, resolveClientBearer, type ClientAccessResult, type ClientAgentContext } from "@/lib/client-agent/access";
import { consumeClientAgentRate } from "@/lib/client-agent/rate-limit";
import { externalOrigin, wwwAuthenticate } from "@/lib/client-agent/protocol";
import { createClientMcpServer } from "@/lib/client-agent/tools";
import type { ClientAgentOps } from "@/lib/client-agent/handlers";
import type { ClientConnectorStore } from "@/lib/client-agent/types";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-protocol-version, www-authenticate",
  "cache-control": "no-store",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body: unknown, status: number, extra?: Record<string, string>) {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...extra },
    }),
  );
}

export type ClientMcpDeps = {
  resolve: (authorization: string | null, expectedResource: string) => Promise<ClientAccessResult>;
  ops: ClientAgentOps;
  rate?: (tokenId: string) => { ok: true; retryAfterSec: number } | { ok: false; retryAfterSec: number };
};

export async function handleClientMcp(request: Request, deps: ClientMcpDeps): Promise<Response> {
  const origin = externalOrigin(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const auth = await deps.resolve(request.headers.get("authorization"), expectedMcpResource(request));
  if (!auth.ok) {
    console.info("client-agent auth rejected");
    return json(
      { error: auth.error, error_description: "Unauthorized." },
      401,
      { "www-authenticate": wwwAuthenticate(origin, auth.error) },
    );
  }

  const rate = (deps.rate ?? ((tokenId: string) => consumeClientAgentRate(tokenId)))(auth.context.tokenId);
  if (!rate.ok) {
    console.info("client-agent rate limited");
    return json({ error: "Too many requests." }, 429, { "retry-after": String(rate.retryAfterSec) });
  }

  if (request.method === "GET" || request.method === "DELETE") {
    return json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
      405,
      { allow: "POST, OPTIONS" },
    );
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { allow: "POST, OPTIONS" });
  }

  return dispatchClientMcp(request, auth.context, deps.ops);
}

export async function dispatchClientMcp(request: Request, ctx: ClientAgentContext, ops: ClientAgentOps) {
  const server = createClientMcpServer(ctx, ops);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withCors(response);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export function clientMcpDeps(store: ClientConnectorStore, ops: ClientAgentOps): ClientMcpDeps {
  return {
    ops,
    resolve: (authorization, expectedResource) => resolveClientBearer(authorization, store, expectedResource),
  };
}
