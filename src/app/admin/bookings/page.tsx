import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingList } from "@/components/booking-list";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { error, cancelled } = await searchParams;
  const rows = await listAdminBookings();
  const now = Date.now();
  const upcoming = rows.filter((row) => row.startsAt.getTime() >= now);
  const past = rows.filter((row) => row.startsAt.getTime() < now);
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <header className="flex items-center justify-between gap-4 py-6">
        <div className="flex min-w-0 items-center gap-3">
          <BkMark size="header" className="shrink-0" />
          <h1 className="text-2xl font-medium">Bookings</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/clients" className="text-sm text-[#8e8e93]">
            Clients
          </Link>
          <SignOutButton admin />
        </div>
      </header>
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      <section className="mb-12">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Upcoming</h2>
        <BookingList
          bookings={upcoming}
          emptyLabel="No upcoming bookings."
          timeZone={hours.timeZone}
          showClient
          allowCancel
        />
      </section>
      <section className="pb-16">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Past</h2>
        <BookingList
          bookings={past}
          emptyLabel="No past bookings."
          timeZone={hours.timeZone}
          showClient
        />
      </section>
    </PhoneShell>
  );
}
