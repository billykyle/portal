import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { QueuedBookingList } from "@/components/booking-list";
import { pageStackClass, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings, splitActiveBookings } from "@/lib/scheduling/bookings";
import { adminBookingHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Queue",
};

export default async function AdminHomeQueuePage() {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { queued } = splitActiveBookings(await listAdminBookings());

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Queue</h1>
      <div className={pageStackClass}>
        {queued.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No shoots in the queue.</p>
        ) : (
          <QueuedBookingList
            bookings={queued}
            showClient
            scheduleHref={(booking) => adminBookingHref(booking.id)}
          />
        )}
      </div>
    </PhoneShell>
  );
}
