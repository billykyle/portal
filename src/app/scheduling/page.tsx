import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingList, ClientQueueSection } from "@/components/booking-list";
import { ClientHeader } from "@/components/client-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { desktopSplitClass, FormColumn, PhoneShell, sectionLabelClass } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import {
  canClientOpenBooking,
  getClientBooking,
  listClientQueuedBookings,
  listClientUpcomingBookings,
} from "@/lib/scheduling/bookings";
import { schedulingHours, placesConfigured } from "@/lib/scheduling/config";
import {
  firstQueryValue,
  isLegacySchedulingQuery,
  schedulingFlowFields,
  type LegacySchedulingQuery,
} from "@/lib/scheduling/draft";
import { migrateLegacySchedulingDraft, readSchedulingDraft } from "@/lib/scheduling/draft-store";
import {
  limitServicesToCategory,
  loadClientCategory,
  servicesForClientCategory,
} from "@/lib/scheduling/category-services";
import { bookingServiceList, COMMERCIAL_VIDEO_SERVICE } from "@/lib/scheduling/services";
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
  const [draft, modifying, upcoming, queued, category] = await Promise.all([
    readSchedulingDraft("client", session.clientId),
    modifyId ? getClientBooking(session.clientId, modifyId) : Promise.resolve(null),
    listClientUpcomingBookings(session.clientId),
    listClientQueuedBookings(session.clientId),
    loadClientCategory(session.clientId),
  ]);
  if (modifyId && (!modifying || !canClientOpenBooking(modifying, session.clientId))) {
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
          commercialHours: modifying.commercialVideoHours,
          updatedAt: modifying.updatedAt,
        }
      : null,
  );
  const hours = schedulingHours();
  const allowedServices = servicesForClientCategory(category);
  const services = limitServicesToCategory(fields.services, category);
  const commercialHours = services.includes(COMMERCIAL_VIDEO_SERVICE) ? fields.commercialHours : null;

  return (
    <PhoneShell>
      <ClientHeader />
      <h1 className="sr-only">Scheduling</h1>
      {params.cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {params.error ? (
        <p role="alert" className="mb-6 text-sm text-[#a1a1a1]">
          {params.error}
        </p>
      ) : null}
      <div className={desktopSplitClass}>
        <section className="min-w-0">
          <h2 className={sectionLabelClass}>
            {modifying?.status === "queued" ? "Schedule shoot" : modifying ? "Modify shoot" : "Book a shoot"}
          </h2>
          <FormColumn className="md:max-w-none lg:max-w-none">
            <BookShootForm
              key={`${modifying?.id ?? "book"}:${fields.address}:${services.join("\n")}:${commercialHours ?? ""}:${fields.notes}:${category ?? ""}`}
              address={fields.address}
              placeId={fields.placeId}
              services={services}
              commercialHours={commercialHours}
              notes={fields.notes}
              placesConfigured={placesConfigured()}
              modifyBookingId={modifying?.id}
              allowedServices={allowedServices}
            />
          </FormColumn>
        </section>
        <section className="min-w-0">
          <ClientQueueSection bookings={queued} />
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
