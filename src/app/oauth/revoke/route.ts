import { handleRevoke, oauthOptions } from "@/lib/client-agent/oauth-http";
import { postgresClientConnectorStore } from "@/lib/client-agent/pg-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleRevoke(request, postgresClientConnectorStore());
}

export function OPTIONS() {
  return oauthOptions();
}
