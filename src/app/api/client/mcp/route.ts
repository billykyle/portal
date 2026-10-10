import { clientMcpDeps, handleClientMcp } from "@/lib/client-agent/http";
import { portalClientAgentOps } from "@/lib/client-agent/ops";
import { postgresClientConnectorStore } from "@/lib/client-agent/pg-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleClientMcp(request, clientMcpDeps(postgresClientConnectorStore(), portalClientAgentOps));
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
