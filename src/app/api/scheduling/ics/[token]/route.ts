import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { getBookingById } from "@/lib/scheduling/bookings";
import { bookingIcsFilename, buildBookingIcs, readBookingIcsToken } from "@/lib/scheduling/booking-ics";
import { bookingServiceList } from "@/lib/scheduling/services";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = readBookingIcsToken(token);
  if (!payload) {
    return NextResponse.json({ error: "That calendar link is invalid or expired." }, { status: 404 });
  }

  await ensureDb();
  const booking = await getBookingById(payload.bookingId);
  if (!booking || booking.status === "cancelled") {
    return NextResponse.json({ error: "Booking was not found." }, { status: 404 });
  }

  const ics = buildBookingIcs({
    bookingId: booking.id,
    address: booking.address,
    services: bookingServiceList(booking),
    start: booking.startsAt,
    end: booking.endsAt,
    notes: booking.notes,
    accessCodes: booking.accessCodes,
  });
  const filename = bookingIcsFilename(booking.startsAt);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
