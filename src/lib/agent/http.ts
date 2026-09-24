import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorizeAgentRequest } from "@/lib/agent/auth";
import { agentClientKey, consumeAgentRate } from "@/lib/agent/rate-limit";
import { createPortalMcpServer } from "@/lib/agent/tools";
import type { AgentOps } from "@/lib/agent/ops";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-protocol-version",
  "cache-control": "no-store",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function agentJson(body: unknown, status: number, extra?: Record<string, string>) {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...extra },
    }),
  );
}

/**
 * Stateless Streamable HTTP MCP. JSON responses (no long-lived SSE) so the
 * route fits a Vercel function. GET/DELETE are 405: Cursor's remote client
 * uses POST, and a hanging SSE GET would hold the isolate open.
 */
export async function handleAgentMcp(request: Request, ops: AgentOps): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = authorizeAgentRequest(request);
  if (!auth.ok) {
    console.info("agent auth rejected");
    return agentJson({ error: auth.error }, auth.status);
  }

  const rate = consumeAgentRate(agentClientKey(request));
  if (!rate.ok) {
    console.info("agent rate limited");
    return agentJson({ error: "Too many requests." }, 429, { "retry-after": String(rate.retryAfterSec) });
  }

  if (request.method === "GET" || request.method === "DELETE") {
    return agentJson(
      { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
      405,
      { allow: "POST, OPTIONS" },
    );
  }
  if (request.method !== "POST") {
    return agentJson({ error: "Method not allowed." }, 405, { allow: "POST, OPTIONS" });
  }

  const server = createPortalMcpServer(ops);
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
