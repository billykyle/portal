import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { getClientBooking } from "@/lib/scheduling/bookings";
import { mergeSyncIssue } from "@/lib/scheduling/booking-sync";
import { schedulingHours } from "@/lib/scheduling/config";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; cancelled?: string; calendar?: string; email?: string; also?: string }>;
}): Promise<Metadata> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (session) {
    await ensureDb();
    const booking = await getClientBooking(session.clientId, id);
    if (booking?.status === "cancelled" || query.cancelled) {
      return { title: "Shoot cancelled" };
    }
  }
  return { title: query.updated ? "Shoot updated" : "Shoot confirmed" };
}

export default async function SchedulingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; cancelled?: string; calendar?: string; email?: string; also?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const alsoId = (query.also ?? "").trim();
  const [booking, companion] = await Promise.all([
    getClientBooking(session.clientId, id),
    alsoId ? getClientBooking(session.clientId, alsoId) : Promise.resolve(null),
  ]);
  const startsAt = booking?.startsAt;
  const endsAt = booking?.endsAt;
  if (!booking || !startsAt || !endsAt) {
    if (booking?.status === "queued") {
      redirect(schedulingBookHref({ modify: booking.id }));
    }
    redirect(schedulingBookHref({ error: "Booking was not found." }));
  }
  const hours = schedulingHours();
  const issue = mergeSyncIssue(booking.syncIssue, query);

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="flex flex-col items-center pb-16 pt-2">
        <BookingConfirmation
          booking={{ ...booking, startsAt, endsAt }}
          also={
            companion?.startsAt && companion.endsAt
              ? { ...companion, startsAt: companion.startsAt, endsAt: companion.endsAt }
              : null
          }
          timeZone={hours.timeZone}
          updated={Boolean(query.updated) && booking.status !== "cancelled"}
          clientId={session.clientId}
          issue={issue}
          billyNotified={!issue.alertFailed}
        />
      </div>
    </PhoneShell>
  );
}
