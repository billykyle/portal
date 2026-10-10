import { metadataResponse, oauthJson, oauthOptions } from "@/lib/client-agent/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return resourceMetadata(request, context.params);
}

export function OPTIONS() {
  return oauthOptions();
}

async function resourceMetadata(request: Request, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  if (path.join("/") !== "api/client/mcp") {
    return oauthJson({ error: "Not found." }, 404);
  }
  return metadataResponse("resource", request);
}
