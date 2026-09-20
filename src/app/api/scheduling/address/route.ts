import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { formatPlaceAddress, PLACES_MISSING_KEY_MESSAGE } from "@/lib/scheduling/places";
import { mapsApiKey } from "@/lib/scheduling/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to look up an address." }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("placeId") ?? "";
  const sessionToken = request.nextUrl.searchParams.get("sessionToken") ?? undefined;
  if (!mapsApiKey()) {
    return NextResponse.json({ configured: false, address: null, error: PLACES_MISSING_KEY_MESSAGE });
  }
  if (!placeId.trim()) {
    return NextResponse.json({ configured: true, address: null, error: "Pick a suggested address." }, { status: 400 });
  }

  const address = await formatPlaceAddress(placeId, sessionToken);
  if (!address) {
    return NextResponse.json({
      configured: true,
      address: null,
      error: "That suggestion could not be loaded. Try another, or type the full street address.",
    });
  }
  return NextResponse.json({ configured: true, address });
}
