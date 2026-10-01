import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { BookingList, QueuedBookingList } from "@/components/booking-list";
import { pageStackClass, PhoneShell } from "@/components/phone-shell";
import {
  ADMIN_SECTIONS_COOKIE,
  bookingsSectionForce,
  parseOpenSections,
  sectionStartsOpen,
} from "@/lib/admin/sections";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings, splitActiveBookings } from "@/lib/scheduling/bookings";
import { adminBookingHref } from "@/lib/scheduling/urls";
import { schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Bookings",
};

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string; updated?: string; queued?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { error, cancelled, updated, queued: queuedNotice } = await searchParams;
  const openSections = parseOpenSections((await cookies()).get(ADMIN_SECTIONS_COOKIE)?.value);
  const notice = Boolean(error || cancelled || updated || queuedNotice);
  const rows = await listAdminBookings();
  const { queued, upcoming, past } = splitActiveBookings(rows);
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Bookings</h1>
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {updated ? <p className="mb-6 text-sm text-white">Shoot updated.</p> : null}
      {queuedNotice ? <p className="mb-6 text-sm text-white">Shoot moved to the queue.</p> : null}
      <div className={pageStackClass}>
        {queued.length > 0 ? (
          <AdminSection id="bookings:queue" label="Queue" defaultOpen>
            <QueuedBookingList
              bookings={queued}
              showClient
              scheduleHref={(booking) => adminBookingHref(booking.id)}
            />
          </AdminSection>
        ) : null}
        <AdminSection
          id="bookings:upcoming"
          label="Upcoming"
          defaultOpen={sectionStartsOpen(
            openSections,
            "bookings:upcoming",
            bookingsSectionForce("bookings:upcoming", { notice }),
          )}
        >
          <BookingList
            bookings={upcoming}
            emptyLabel="No upcoming bookings."
            timeZone={hours.timeZone}
            showClient
            allowCancel
            allowModify
            admin
            columns={2}
          />
        </AdminSection>
        <AdminSection
          id="bookings:past"
          label="Past"
          defaultOpen={sectionStartsOpen(openSections, "bookings:past", false)}
        >
          <BookingList
            bookings={past}
            emptyLabel="No past bookings."
            timeZone={hours.timeZone}
            showClient
            allowModify
            admin
            columns={2}
          />
        </AdminSection>
      </div>
    </PhoneShell>
  );
}
