import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingList } from "@/components/booking-list";
import { ClientHeader } from "@/components/client-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { canModifyBooking, getClientBooking, listClientUpcomingBookings } from "@/lib/scheduling/bookings";
import { schedulingHours, placesConfigured } from "@/lib/scheduling/config";
import { bookingServiceList, parseSchedulingServices } from "@/lib/scheduling/services";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Scheduling",
};

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{
    address?: string;
    placeId?: string;
    service?: string | string[];
    notes?: string;
    booked?: string;
    cancelled?: string;
    modified?: string;
    modify?: string;
    error?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const {
    address: rawAddress = "",
    placeId: rawPlaceId = "",
    service: rawService,
    notes: rawNotes = "",
    booked,
    cancelled,
    modified,
    modify: rawModify = "",
    error,
  } = await searchParams;
  const modifyId = rawModify.trim();
  const modifying = modifyId ? await getClientBooking(session.clientId, modifyId) : null;
  if (modifyId && (!modifying || !canModifyBooking(modifying, session.clientId))) {
    redirect(schedulingBookHref({ error: "That booking cannot be modified." }));
  }
  const selectedServices = parseSchedulingServices(
    rawService ?? (modifying ? bookingServiceList(modifying) : undefined),
  );
  const hours = schedulingHours();
  const upcoming = await listClientUpcomingBookings(session.clientId);
  const typedAddress = rawAddress.trim() || modifying?.address || "";
  const typedNotes = rawNotes.trim() || modifying?.notes || "";

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Scheduling</h1>
        {booked ? <p className="mt-3 text-sm text-white">You&apos;re booked.</p> : null}
        {modified ? <p className="mt-3 text-sm text-white">Booking updated.</p> : null}
        {cancelled ? <p className="mt-3 text-sm text-white">Booking cancelled.</p> : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {error}
          </p>
        ) : null}
      </div>
      <div className="grid gap-12 pb-16 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Upcoming</h2>
          <BookingList
            bookings={upcoming}
            emptyLabel="No upcoming shoots yet."
            timeZone={hours.timeZone}
            allowCancel
            allowModify
            clientId={session.clientId}
          />
        </section>
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">
            {modifying ? "Modify shoot" : "Book a shoot"}
          </h2>
          <FormColumn>
            <BookShootForm
              key={modifying?.id ?? "book"}
              address={typedAddress}
              placeId={rawPlaceId.trim()}
              services={selectedServices}
              notes={typedNotes}
              placesConfigured={placesConfigured()}
              modifyBookingId={modifying?.id}
            />
          </FormColumn>
        </section>
      </div>
    </PhoneShell>
  );
}
