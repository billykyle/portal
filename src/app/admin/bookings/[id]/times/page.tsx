import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { BookTimesPanel } from "@/components/forms/book-times-panel";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { parseShootAddress } from "@/lib/scheduling/address";
import { canAdminOpenBooking, getBookingById } from "@/lib/scheduling/bookings";
import {
  firstQueryValue,
  isLegacySchedulingQuery,
  schedulingFlowFields,
  type LegacySchedulingQuery,
} from "@/lib/scheduling/draft";
import { migrateLegacySchedulingDraft, readSchedulingDraft } from "@/lib/scheduling/draft-store";
import {
  bookingServiceList,
  COMMERCIAL_VIDEO_HOURS_ERROR,
  includesCommercialVideo,
} from "@/lib/scheduling/services";
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
  if (!canAdminOpenBooking(booking)) {
    redirect("/admin/bookings?error=That%20booking%20cannot%20be%20modified.");
  }

  const fields = schedulingFlowFields(draft, booking.id, {
    address: booking.address,
    notes: booking.notes,
    services: bookingServiceList(booking),
    commercialHours: booking.commercialVideoHours,
    updatedAt: booking.updatedAt,
  });
  if (fields.services.length === 0) {
    redirect(schedulingEditorHref({ fromAdmin: true, bookingId: booking.id, error: "Pick at least one service." }));
  }
  if (includesCommercialVideo(fields.services) && fields.commercialHours == null) {
    redirect(
      schedulingEditorHref({ fromAdmin: true, bookingId: booking.id, error: COMMERCIAL_VIDEO_HOURS_ERROR }),
    );
  }
  const parsed = parseShootAddress(fields.address);
  if (!parsed.ok) {
    redirect(schedulingEditorHref({ fromAdmin: true, bookingId: booking.id, error: parsed.error }));
  }

  return (
    <PhoneShell>
      <AdminHeader />
      <h1 className="sr-only">Modify shoot</h1>
      {query.error ? (
        <p role="alert" className="mb-6 text-sm text-[#a1a1a1]">
          {query.error}
        </p>
      ) : null}
      <FormColumn className="pb-16 md:max-w-none lg:max-w-none">
        <BookTimesPanel
          address={parsed.address}
          placeId={fields.placeId || undefined}
          services={fields.services}
          commercialHours={fields.commercialHours}
          notes={fields.notes}
          error={query.error}
          modifyBookingId={booking.id}
          currentSlot={
            booking.startsAt && booking.endsAt
              ? `${booking.startsAt.toISOString()}|${booking.endsAt.toISOString()}`
              : undefined
          }
          fromAdmin
        />
      </FormColumn>
    </PhoneShell>
  );
}
