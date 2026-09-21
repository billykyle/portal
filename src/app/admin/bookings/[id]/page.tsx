import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BookShootForm } from "@/components/forms/book-shoot-form";
import { FormColumn, PhoneShell, pageTitleClass } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { canAdminModifyBooking, getBookingById } from "@/lib/scheduling/bookings";
import { placesConfigured } from "@/lib/scheduling/config";
import {
  firstQueryValue,
  isLegacySchedulingQuery,
  schedulingFlowFields,
  type LegacySchedulingQuery,
} from "@/lib/scheduling/draft";
import { migrateLegacySchedulingDraft, readSchedulingDraft } from "@/lib/scheduling/draft-store";
import { bookingServiceList } from "@/lib/scheduling/services";

export default async function AdminModifyBookingPage({
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
        to: "book",
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
  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
  const fields = schedulingFlowFields(draft, booking.id, {
    address: booking.address,
    notes: booking.notes,
    services: bookingServiceList(booking),
    updatedAt: booking.updatedAt,
  });

  return (
    <PhoneShell>
      <AppHeader
        left={
          <Link href="/admin/bookings" className="text-sm text-[#8e8e93]">
            Bookings
          </Link>
        }
      />
      <FormColumn center className="pb-16">
        <div className="mb-8 lg:mb-10">
          <h1 className={pageTitleClass}>Modify shoot</h1>
          {client ? (
            <p className="mt-2 text-sm text-[#8e8e93]">
              {client.inviteCode} · {client.displayName}
            </p>
          ) : null}
          {query.error ? (
            <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
              {query.error}
            </p>
          ) : null}
        </div>
        <BookShootForm
          key={`${booking.id}:${fields.address}:${fields.services.join("\n")}:${fields.notes}`}
          address={fields.address}
          placeId={fields.placeId}
          services={fields.services}
          notes={fields.notes}
          placesConfigured={placesConfigured()}
          modifyBookingId={booking.id}
          fromAdmin
        />
      </FormColumn>
    </PhoneShell>
  );
}
