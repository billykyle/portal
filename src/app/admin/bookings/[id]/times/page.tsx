import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BookTimesPanel } from "@/components/forms/book-times-panel";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { parseShootAddress } from "@/lib/scheduling/address";
import { canAdminModifyBooking, getBookingById } from "@/lib/scheduling/bookings";
import {
  firstQueryValue,
  isLegacySchedulingQuery,
  schedulingFlowFields,
  type LegacySchedulingQuery,
} from "@/lib/scheduling/draft";
import { migrateLegacySchedulingDraft, readSchedulingDraft } from "@/lib/scheduling/draft-store";
import { bookingServiceList } from "@/lib/scheduling/services";
import { schedulingEditorHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Modify shoot times",
};

export default async function AdminModifyBookingTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<LegacySchedulingQuery & { error?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { id } = await params;
  const query = await searchParams;
  if (isLegacySchedulingQuery(query)) {
    redirect(
      await migrateLegacySchedulingDraft({
        scope: "admin",
        to: "times",
        clientId: null,
        userId: null,
        bookingId: id,
        address: firstQueryValue(query.address),
        placeId: firstQueryValue(query.placeId),
        service: query.service,
        notes: firstQueryValue(query.notes),
        error: query.error,
      }),
    );
  }

  const [draft, booking] = await Promise.all([readSchedulingDraft("admin", null), getBookingById(id)]);
  if (!booking) {
    notFound();
  }
  if (!canAdminModifyBooking(booking)) {
    redirect("/admin/bookings?error=That%20booking%20cannot%20be%20modified.");
  }

  const fields = schedulingFlowFields(draft, booking.id, {
    address: booking.address,
    notes: booking.notes,
    services: bookingServiceList(booking),
    updatedAt: booking.updatedAt,
  });
  if (fields.services.length === 0) {
    redirect(schedulingEditorHref({ fromAdmin: true, bookingId: booking.id, error: "Pick at least one service." }));
  }
  const parsed = parseShootAddress(fields.address);
  if (!parsed.ok) {
    redirect(schedulingEditorHref({ fromAdmin: true, bookingId: booking.id, error: parsed.error }));
  }

  const changeHref = schedulingEditorHref({ fromAdmin: true, bookingId: booking.id });

  return (
    <PhoneShell>
      <AppHeader
        left={
          <Link href={changeHref} className="text-sm text-[#8e8e93]">
            Address
          </Link>
        }
      />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Modify shoot</h1>
        {query.error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {query.error}
          </p>
        ) : null}
      </div>
      <FormColumn className="pb-16">
        <BookTimesPanel
          address={parsed.address}
          placeId={fields.placeId || undefined}
          services={fields.services}
          notes={fields.notes}
          error={query.error}
          modifyBookingId={booking.id}
          currentSlot={`${booking.startsAt.toISOString()}|${booking.endsAt.toISOString()}`}
          fromAdmin
        />
      </FormColumn>
    </PhoneShell>
  );
}
