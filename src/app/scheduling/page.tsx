import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingList } from "@/components/booking-list";
import { ClientHeader } from "@/components/client-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loadLiveAvailabilitySources, offerSlotsForAddress } from "@/lib/scheduling/availability";
import { loadConfirmedPortalJobs, listClientUpcomingBookings } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Scheduling",
};

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{
    address?: string;
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
  const { address: rawAddress = "", booked, cancelled, error } = await searchParams;
  const hours = schedulingHours();
  const [clientRows, upcoming, portalJobs] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1),
    listClientUpcomingBookings(session.clientId),
    loadConfirmedPortalJobs(),
  ]);
  const [client] = clientRows;

  let availability = null;
  let addressError: string | undefined;
  const typedAddress = rawAddress.trim();
  if (typedAddress) {
    const sources = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in sources) {
      addressError = sources.error;
    } else {
      availability = await offerSlotsForAddress(typedAddress, sources);
      if (availability.error) {
        addressError = availability.error;
        availability = null;
      }
    }
  }

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Scheduling</h1>
        <p className="mt-2 text-sm leading-6 text-[#8e8e93]">
          Address first, then available times. {client?.displayName ?? "Your"} upcoming shoots stay
          here.
        </p>
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
              addressError={addressError}
              availability={availability}
            />
          </FormColumn>
        </section>
      </div>
    </PhoneShell>
  );
}
