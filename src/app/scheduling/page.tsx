import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingList } from "@/components/booking-list";
import { ClientHeader } from "@/components/client-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { FormColumn, pageTitleClass, PhoneShell, sectionLabelClass } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { canModifyBooking, getClientBooking, listClientUpcomingBookings } from "@/lib/scheduling/bookings";
import { schedulingHours, placesConfigured } from "@/lib/scheduling/config";
import {
  firstQueryValue,
  isLegacySchedulingQuery,
  schedulingFlowFields,
  type LegacySchedulingQuery,
} from "@/lib/scheduling/draft";
import { migrateLegacySchedulingDraft, readSchedulingDraft } from "@/lib/scheduling/draft-store";
import { bookingServiceList } from "@/lib/scheduling/services";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Scheduling",
};

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<
    LegacySchedulingQuery & {
      cancelled?: string;
      modify?: string;
      error?: string;
    }
  >;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const params = await searchParams;
  if (isLegacySchedulingQuery(params)) {
    redirect(
      await migrateLegacySchedulingDraft({
        scope: "client",
        to: "book",
        clientId: session.clientId,
        userId: session.userId,
        address: firstQueryValue(params.address),
        placeId: firstQueryValue(params.placeId),
        service: params.service,
        notes: firstQueryValue(params.notes),
        modify: params.modify,
        error: params.error,
        cancelled: params.cancelled,
      }),
    );
  }

  const modifyId = (params.modify ?? "").trim();
  const [draft, modifying, upcoming] = await Promise.all([
    readSchedulingDraft("client", session.clientId),
    modifyId ? getClientBooking(session.clientId, modifyId) : Promise.resolve(null),
    listClientUpcomingBookings(session.clientId),
  ]);
  if (modifyId && (!modifying || !canModifyBooking(modifying, session.clientId))) {
    redirect(schedulingBookHref({ error: "That booking cannot be modified." }));
  }
  const fields = schedulingFlowFields(
    draft,
    modifyId,
    modifying
      ? {
          address: modifying.address,
          notes: modifying.notes,
          services: bookingServiceList(modifying),
          updatedAt: modifying.updatedAt,
        }
      : null,
  );
  const hours = schedulingHours();

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="mb-8 lg:mb-10">
        <h1 className={pageTitleClass}>Scheduling</h1>
        {params.cancelled ? <p className="mt-3 text-sm text-white">Booking cancelled.</p> : null}
        {params.error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {params.error}
          </p>
        ) : null}
      </div>
      <div className="grid gap-12 pb-16 lg:grid-cols-2 lg:items-start lg:gap-x-16">
        <section className="min-w-0">
          <h2 className={sectionLabelClass}>
            {modifying ? "Modify shoot" : "Book a shoot"}
          </h2>
          <FormColumn className="lg:max-w-none">
            <BookShootForm
              key={`${modifying?.id ?? "book"}:${fields.address}:${fields.services.join("\n")}:${fields.notes}`}
              address={fields.address}
              placeId={fields.placeId}
              services={fields.services}
              notes={fields.notes}
              placesConfigured={placesConfigured()}
              modifyBookingId={modifying?.id}
            />
          </FormColumn>
        </section>
        <section className="min-w-0">
          <h2 className={sectionLabelClass}>Upcoming</h2>
          <BookingList
            bookings={upcoming}
            emptyLabel="No upcoming shoots yet."
            timeZone={hours.timeZone}
            allowCancel
            allowModify
            clientId={session.clientId}
          />
        </section>
      </div>
    </PhoneShell>
  );
}
