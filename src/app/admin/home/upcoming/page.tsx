import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { BookingList } from "@/components/booking-list";
import { pageStackClass, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings, splitActiveBookings } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Upcoming",
};

export default async function AdminHomeUpcomingPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; updated?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { cancelled, updated } = await searchParams;
  const { upcoming } = splitActiveBookings(await listAdminBookings());
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Upcoming</h1>
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {updated ? <p className="mb-6 text-sm text-white">Shoot updated.</p> : null}
      <div className={pageStackClass}>
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
      </div>
    </PhoneShell>
  );
}
