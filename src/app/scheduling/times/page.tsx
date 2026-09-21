import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientHeader } from "@/components/client-header";
import { BookTimesPanel } from "@/components/forms/book-times-panel";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { parseShootAddress } from "@/lib/scheduling/address";
import { canModifyBooking, getClientBooking } from "@/lib/scheduling/bookings";
import { parseSchedulingServices } from "@/lib/scheduling/services";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Available times",
};

export default async function SchedulingTimesPage({
  searchParams,
}: {
  searchParams: Promise<{
    address?: string;
    placeId?: string;
    service?: string | string[];
    notes?: string;
    error?: string;
    modify?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const {
    address: rawAddress = "",
    placeId: rawPlaceId = "",
    service: rawService,
    notes: rawNotes = "",
    error,
    modify: rawModify = "",
  } = await searchParams;
  const selectedServices = parseSchedulingServices(rawService);
  const typedAddress = rawAddress.trim();
  const placeId = rawPlaceId.trim();
  const notes = rawNotes.trim();
  const modifyId = rawModify.trim();
  const modifying = modifyId ? await getClientBooking(session.clientId, modifyId) : null;
  if (modifyId && (!modifying || !canModifyBooking(modifying, session.clientId))) {
    redirect(schedulingBookHref({ error: "That booking cannot be modified." }));
  }

  if (selectedServices.length === 0) {
    redirect(
      schedulingBookHref({
        address: typedAddress || null,
        placeId: placeId || null,
        notes: notes || null,
        modify: modifying?.id ?? null,
        error: "Pick at least one service.",
      }),
    );
  }

  const parsed = parseShootAddress(typedAddress);
  if (!parsed.ok) {
    redirect(
      schedulingBookHref({
        address: typedAddress || null,
        placeId: placeId || null,
        services: selectedServices,
        notes: notes || null,
        modify: modifying?.id ?? null,
        error: parsed.error,
      }),
    );
  }

  const changeHref = schedulingBookHref({
    address: parsed.address,
    services: selectedServices,
    notes: notes || null,
    modify: modifying?.id ?? null,
  });

  return (
    <TimesShell changeHref={changeHref} error={error}>
      <BookTimesPanel
        address={parsed.address}
        placeId={placeId || undefined}
        services={selectedServices}
        notes={notes}
        error={error}
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
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Scheduling</h1>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {error}
          </p>
        ) : null}
      </div>
      <FormColumn className="pb-16">{children}</FormColumn>
    </PhoneShell>
  );
}
