import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { loadModifyAvailabilityContext, loadOfferedAvailability } from "@/lib/scheduling/load-offered-availability";
import { parseSchedulingServices } from "@/lib/scheduling/services";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to load times.", kind: "address" }, { status: 401 });
  }

  await ensureDb();
  const services = parseSchedulingServices(request.nextUrl.searchParams.getAll("service"));
  if (services.length === 0) {
    return NextResponse.json({ error: "Pick at least one service.", kind: "address" }, { status: 400 });
  }

  const modifying = await loadModifyAvailabilityContext(
    session.clientId,
    request.nextUrl.searchParams.get("modify"),
  );
  if (modifying && "error" in modifying) {
    return NextResponse.json({ error: modifying.error, kind: "address" }, { status: 400 });
  }

  const result = await loadOfferedAvailability({
    address: request.nextUrl.searchParams.get("address") ?? "",
    placeId: request.nextUrl.searchParams.get("placeId"),
    services,
    modifying,
  });
  if (!result.ok) {
    const status = result.kind === "calendar" ? 503 : 400;
    return NextResponse.json({ error: result.error, kind: result.kind }, { status });
  }
  return NextResponse.json({ availability: result.availability });
}
