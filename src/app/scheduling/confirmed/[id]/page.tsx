import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { getClientBooking } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}): Promise<Metadata> {
  const { updated } = await searchParams;
  return { title: updated ? "Shoot updated" : "Shoot confirmed" };
}

export default async function SchedulingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [{ id }, { updated }] = await Promise.all([params, searchParams]);
  const booking = await getClientBooking(session.clientId, id);
  if (!booking || booking.status === "cancelled") {
    redirect(schedulingBookHref({ error: "Booking was not found." }));
  }
  const hours = schedulingHours();

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="flex flex-1 flex-col items-center justify-center py-8 pb-16">
        <BookingConfirmation
          booking={booking}
          timeZone={hours.timeZone}
          updated={Boolean(updated)}
          clientId={session.clientId}
        />
      </div>
    </PhoneShell>
  );
}
