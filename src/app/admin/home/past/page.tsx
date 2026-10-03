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
  title: "Past",
};

export default async function AdminHomePastPage() {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { past } = splitActiveBookings(await listAdminBookings());
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Past</h1>
      <div className={pageStackClass}>
        <BookingList
          bookings={past}
          emptyLabel="No past bookings."
          timeZone={hours.timeZone}
          showClient
          allowModify
          admin
          columns={2}
        />
      </div>
    </PhoneShell>
  );
}
