import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingList } from "@/components/booking-list";
import { AppHeader } from "@/components/app-header";
import { PhoneShell } from "@/components/phone-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";

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
  const rows = await listAdminBookings();
  const now = Date.now();
  const upcoming = rows.filter((row) => row.startsAt.getTime() >= now);
  const past = rows.filter((row) => row.startsAt.getTime() < now);
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <AppHeader
        left={<h1 className="truncate text-2xl font-medium">Bookings</h1>}
        right={
          <>
            <Link href="/admin/clients" className="text-sm text-[#8e8e93]">
              Clients
            </Link>
            <SignOutButton admin />
          </>
        }
      />
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {updated ? <p className="mb-6 text-sm text-white">Shoot updated.</p> : null}
      <section className="mb-12">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Upcoming</h2>
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
      </section>
      <section className="pb-16">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Past</h2>
        <BookingList
          bookings={past}
          emptyLabel="No past bookings."
          timeZone={hours.timeZone}
          showClient
          columns={2}
        />
      </section>
    </PhoneShell>
  );
}
