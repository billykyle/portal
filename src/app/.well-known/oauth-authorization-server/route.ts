import { metadataResponse, oauthOptions } from "@/lib/client-agent/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return metadataResponse("authorization", request);
}

export function OPTIONS() {
  return oauthOptions();
}
