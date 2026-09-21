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
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; cancelled?: string }>;
}): Promise<Metadata> {
  const [{ id }, { updated, cancelled }] = await Promise.all([params, searchParams]);
  if (cancelled) return { title: "Shoot cancelled" };
  const session = await getSession();
  if (session) {
    await ensureDb();
    const booking = await getClientBooking(session.clientId, id);
    if (booking?.status === "cancelled") return { title: "Shoot cancelled" };
  }
  return { title: updated ? "Shoot updated" : "Shoot confirmed" };
}

export default async function SchedulingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; cancelled?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [{ id }, { updated }] = await Promise.all([params, searchParams]);
  const booking = await getClientBooking(session.clientId, id);
  if (!booking) {
    redirect(schedulingBookHref({ error: "Booking was not found." }));
  }
  const hours = schedulingHours();
  const cancelled = booking.status === "cancelled";

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="flex flex-1 flex-col items-center justify-center py-8 pb-16">
        <BookingConfirmation
          booking={booking}
          timeZone={hours.timeZone}
          updated={Boolean(updated) && !cancelled}
          cancelled={cancelled}
          clientId={session.clientId}
        />
      </div>
    </PhoneShell>
  );
}
