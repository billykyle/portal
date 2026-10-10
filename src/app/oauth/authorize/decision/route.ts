import { getSession } from "@/lib/auth";
import { describeAuthorize, issueAuthorizationCode } from "@/lib/client-agent/flow";
import { externalOrigin, oauthRedirect } from "@/lib/client-agent/protocol";
import { postgresClientConnectorStore } from "@/lib/client-agent/pg-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

export async function POST(request: Request) {
  const expected = externalOrigin(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== expected) {
    return new Response("Forbidden", { status: 403 });
  }
  const form = await request.formData();
  const search = new URLSearchParams();
  for (const key of FIELDS) {
    const value = form.get(key);
    if (typeof value === "string" && value) search.set(key, value);
  }
  if (!search.get("response_type")) search.set("response_type", "code");
  const store = postgresClientConnectorStore();
  const described = await describeAuthorize(store, search, expected);
  if (!described.ok) {
    if (described.redirect) return redirectTo(described.redirect);
    return redirectTo(`/oauth/authorize?${search.toString()}&portal_error=${encodeURIComponent(described.message)}`);
  }
  const session = await getSession();
  if (!session) return redirectTo(`/oauth/authorize?${search.toString()}`);
  if (String(form.get("decision") ?? "") === "deny") {
    return redirectTo(
      oauthRedirect(described.request.redirectUri, {
        error: "access_denied",
        error_description: "The request was denied.",
        state: described.request.state,
      }),
    );
  }
  const issued = await issueAuthorizationCode(store, {
    request: described.request,
    userId: session.userId,
    portalClientId: String(form.get("portalClientId") ?? ""),
  });
  return redirectTo(issued.redirectUrl);
}
