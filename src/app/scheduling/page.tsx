import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingList } from "@/components/booking-list";
import { ClientHeader } from "@/components/client-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { listClientUpcomingBookings } from "@/lib/scheduling/bookings";
import { schedulingHours, placesConfigured } from "@/lib/scheduling/config";
import { parseSchedulingServices } from "@/lib/scheduling/services";

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
    booked?: string;
    cancelled?: string;
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
    booked,
    cancelled,
    error,
  } = await searchParams;
  const selectedServices = parseSchedulingServices(rawService);
  const hours = schedulingHours();
  const upcoming = await listClientUpcomingBookings(session.clientId);
  const typedAddress = rawAddress.trim();

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Scheduling</h1>
        {booked ? <p className="mt-3 text-sm text-white">You&apos;re booked.</p> : null}
        {cancelled ? <p className="mt-3 text-sm text-white">Booking cancelled.</p> : null}
        {error ? <p className="mt-3 text-sm text-[#a1a1a1]">{error}</p> : null}
      </div>
      <div className="grid gap-12 pb-16 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Upcoming</h2>
          <BookingList
            bookings={upcoming}
            emptyLabel="No upcoming shoots yet."
            timeZone={hours.timeZone}
            allowCancel
          />
        </section>
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Book a shoot</h2>
          <FormColumn>
            <BookShootForm
              address={typedAddress}
              placeId={rawPlaceId.trim()}
              services={selectedServices}
              placesConfigured={placesConfigured()}
            />
          </FormColumn>
        </section>
      </div>
    </PhoneShell>
  );
}
