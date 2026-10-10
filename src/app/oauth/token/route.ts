import { handleToken, oauthOptions } from "@/lib/client-agent/oauth-http";
import { postgresClientConnectorStore } from "@/lib/client-agent/pg-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleToken(request, postgresClientConnectorStore());
}

export function OPTIONS() {
  return oauthOptions();
}
