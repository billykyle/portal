import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientHeader } from "@/components/client-header";
import { BookTimesPanel } from "@/components/forms/book-times-panel";
import { FormColumn, pageTitleClass, PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { parseShootAddress } from "@/lib/scheduling/address";
import { canModifyBooking, getClientBooking } from "@/lib/scheduling/bookings";
import {
  firstQueryValue,
  isLegacySchedulingQuery,
  schedulingFlowFields,
  type LegacySchedulingQuery,
} from "@/lib/scheduling/draft";
import { migrateLegacySchedulingDraft, readSchedulingDraft } from "@/lib/scheduling/draft-store";
import { bookingServiceList } from "@/lib/scheduling/services";
import { schedulingBookHref, schedulingEditorHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Available times",
};

export default async function SchedulingTimesPage({
  searchParams,
}: {
  searchParams: Promise<LegacySchedulingQuery & { error?: string; modify?: string }>;
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
        to: "times",
        clientId: session.clientId,
        userId: session.userId,
        address: firstQueryValue(params.address),
        placeId: firstQueryValue(params.placeId),
        service: params.service,
        notes: firstQueryValue(params.notes),
        modify: params.modify,
        error: params.error,
      }),
    );
  }

  const modifyId = (params.modify ?? "").trim();
  const [draft, modifying] = await Promise.all([
    readSchedulingDraft("client", session.clientId),
    modifyId ? getClientBooking(session.clientId, modifyId) : Promise.resolve(null),
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
  if (fields.services.length === 0) {
    redirect(schedulingBookHref({ modify: modifying?.id ?? null, error: "Pick at least one service." }));
  }
  const parsed = parseShootAddress(fields.address);
  if (!parsed.ok) {
    redirect(schedulingBookHref({ modify: modifying?.id ?? null, error: parsed.error }));
  }

  const changeHref = schedulingEditorHref({ bookingId: modifying?.id });

  return (
    <TimesShell changeHref={changeHref} error={params.error}>
      <BookTimesPanel
        address={parsed.address}
        placeId={fields.placeId || undefined}
        services={fields.services}
        notes={fields.notes}
        error={params.error}
        modifyBookingId={modifying?.id}
        currentSlot={
          modifying ? `${modifying.startsAt.toISOString()}|${modifying.endsAt.toISOString()}` : undefined
        }
      />
    </TimesShell>
  );
}

function TimesShell({
  changeHref,
  error,
  children,
}: {
  changeHref: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <PhoneShell>
      <ClientHeader backHref={changeHref} backLabel="Address" />
      <div className="mb-8 lg:mb-10">
        <h1 className={pageTitleClass}>Scheduling</h1>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {error}
          </p>
        ) : null}
      </div>
      <FormColumn className="pb-16 lg:max-w-none">{children}</FormColumn>
    </PhoneShell>
  );
}
