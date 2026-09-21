import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { canAdminModifyBooking, getBookingById } from "@/lib/scheduling/bookings";
import { placesConfigured } from "@/lib/scheduling/config";
import { bookingServiceList, parseSchedulingServices } from "@/lib/scheduling/services";
import { adminBookingTimesHref } from "@/lib/scheduling/urls";

export default async function AdminModifyBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    address?: string;
    placeId?: string;
    service?: string | string[];
    notes?: string;
    error?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { id } = await params;
  const {
    address: rawAddress = "",
    placeId: rawPlaceId = "",
    service: rawService,
    notes: rawNotes = "",
    error,
  } = await searchParams;
  const booking = await getBookingById(id);
  if (!booking) {
    notFound();
  }
  if (!canAdminModifyBooking(booking)) {
    redirect("/admin/bookings?error=That%20booking%20cannot%20be%20modified.");
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
  const selectedServices = parseSchedulingServices(rawService ?? bookingServiceList(booking));
  const typedAddress = rawAddress.trim() || booking.address;
  const typedNotes = rawNotes.trim() || booking.notes || "";

  return (
    <PhoneShell>
      <AppHeader
        left={
          <Link href="/admin/bookings" className="text-sm text-[#8e8e93]">
            Bookings
          </Link>
        }
      />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Modify shoot</h1>
        {client ? (
          <p className="mt-2 text-sm text-[#8e8e93]">
            {client.inviteCode} · {client.displayName}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {error}
          </p>
        ) : null}
      </div>
      <FormColumn className="pb-16">
        <BookShootForm
          key={booking.id}
          address={typedAddress}
          placeId={rawPlaceId.trim()}
          services={selectedServices}
          notes={typedNotes}
          placesConfigured={placesConfigured()}
          modifyBookingId={booking.id}
          timesAction={adminBookingTimesHref(booking.id)}
          fromAdmin
        />
      </FormColumn>
    </PhoneShell>
  );
}
