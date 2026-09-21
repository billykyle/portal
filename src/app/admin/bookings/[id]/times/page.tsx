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
import { parseSchedulingServices } from "@/lib/scheduling/services";
import { adminBookingHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Modify shoot times",
};

export default async function AdminModifyBookingTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    address?: string;
    placeId?: string;
    service?: string | string[];
    notes?: string;
    error?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { id } = await params;
  const {
    address: rawAddress = "",
    placeId: rawPlaceId = "",
    service: rawService,
    notes: rawNotes = "",
    error,
  } = await searchParams;
  const booking = await getBookingById(id);
  if (!booking) {
    notFound();
  }
  if (!canAdminModifyBooking(booking)) {
    redirect("/admin/bookings?error=That%20booking%20cannot%20be%20modified.");
  }

  const selectedServices = parseSchedulingServices(rawService);
  const typedAddress = rawAddress.trim();
  const placeId = rawPlaceId.trim();
  const notes = rawNotes.trim();

  if (selectedServices.length === 0) {
    redirect(
      adminBookingHref(booking.id, {
        address: typedAddress || booking.address,
        placeId: placeId || null,
        notes: notes || booking.notes,
        error: "Pick at least one service.",
      }),
    );
  }

  const parsed = parseShootAddress(typedAddress || booking.address);
  if (!parsed.ok) {
    redirect(
      adminBookingHref(booking.id, {
        address: typedAddress || booking.address,
        placeId: placeId || null,
        services: selectedServices,
        notes: notes || booking.notes,
        error: parsed.error,
      }),
    );
  }

  const changeHref = adminBookingHref(booking.id, {
    address: parsed.address,
    services: selectedServices,
    notes: notes || booking.notes,
  });

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
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {error}
          </p>
        ) : null}
      </div>
      <FormColumn className="pb-16">
        <BookTimesPanel
          address={parsed.address}
          placeId={placeId || undefined}
          services={selectedServices}
          notes={notes}
          error={error}
          modifyBookingId={booking.id}
          currentSlot={`${booking.startsAt.toISOString()}|${booking.endsAt.toISOString()}`}
          fromAdmin
        />
      </FormColumn>
    </PhoneShell>
  );
}
