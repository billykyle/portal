import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { BookingList } from "@/components/booking-list";
import { PhoneShell } from "@/components/phone-shell";
import {
  ADMIN_SECTIONS_COOKIE,
  bookingsSectionForce,
  parseOpenSections,
  sectionStartsOpen,
} from "@/lib/admin/sections";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Bookings",
};

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string; updated?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { error, cancelled, updated } = await searchParams;
  const openSections = parseOpenSections((await cookies()).get(ADMIN_SECTIONS_COOKIE)?.value);
  const notice = Boolean(error || cancelled || updated);
  const rows = await listAdminBookings();
  const now = Date.now();
  const upcoming = rows.filter((row) => row.startsAt.getTime() >= now);
  const past = rows.filter((row) => row.startsAt.getTime() < now);
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Bookings</h1>
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {updated ? <p className="mb-6 text-sm text-white">Shoot updated.</p> : null}
      <div className="pb-8">
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
            columns={2}
          />
        </AdminSection>
      </div>
    </PhoneShell>
  );
}
