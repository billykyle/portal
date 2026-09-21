import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { readSchedulingDraftById } from "@/lib/scheduling/draft-store";
import { draftCookieName, draftCookieOptions, isDraftId, schedulingStepPath, type DraftStep } from "@/lib/scheduling/draft";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("d") ?? "";
  const to: DraftStep = request.nextUrl.searchParams.get("to") === "times" ? "times" : "book";
  const error = request.nextUrl.searchParams.get("error");
  const cancelled = request.nextUrl.searchParams.get("cancelled");
  if (!isDraftId(id)) {
    return NextResponse.redirect(new URL("/scheduling", request.url));
  }

  await ensureDb();
  const found = await readSchedulingDraftById(id);
  if (!found) {
    return NextResponse.redirect(new URL("/scheduling", request.url));
  }

  if (found.draft.scope === "admin") {
    if (!(await getAdminSession())) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  } else {
    const session = await getSession();
    if (!session || session.clientId !== found.clientId) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const path = schedulingStepPath({
    scope: found.draft.scope,
    to,
    modifyBookingId: found.draft.modifyBookingId,
    bookingId: found.draft.modifyBookingId,
    error,
    cancelled,
  });
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.set(draftCookieName(found.draft.scope), found.draft.id, draftCookieOptions());
  return response;
}
