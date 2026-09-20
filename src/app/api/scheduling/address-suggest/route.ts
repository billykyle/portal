import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { suggestAddresses } from "@/lib/scheduling/places";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to look up an address." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const sessionToken = request.nextUrl.searchParams.get("sessionToken") ?? undefined;
  const result = await suggestAddresses(query, sessionToken);
  return NextResponse.json(result);
}
