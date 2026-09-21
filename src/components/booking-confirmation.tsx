import Link from "next/link";
import { CancelBookingForm } from "@/components/forms/cancel-booking-form";
import { CLIENT_HOME, CLIENT_SCHEDULING } from "@/lib/routes";
import { canModifyBooking } from "@/lib/scheduling/bookings";
import { bookingServiceList } from "@/lib/scheduling/services";
import { formatBookingDuration, formatBookingTimeZone, formatBookingWhen } from "@/lib/scheduling/slots";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export type BookingConfirmationDetails = {
  id: string;
  address: string;
  services?: string[] | null;
  service?: string | null;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
  accessCodes?: string | null;
  status?: string;
  clientId?: string;
};

export function BookingConfirmation({
  booking,
  timeZone,
  updated = false,
  clientId,
}: {
  booking: BookingConfirmationDetails;
  timeZone: string;
  updated?: boolean;
  clientId?: string;
}) {
  const services = bookingServiceList(booking);
  const when = formatBookingWhen(booking.startsAt, booking.endsAt, timeZone);
  const duration = formatBookingDuration(booking.startsAt, booking.endsAt);
  const zone = formatBookingTimeZone(timeZone);
  const notes = booking.notes?.trim() || "";
  const accessCodes = booking.accessCodes?.trim() || "";
  const ownerId = clientId ?? booking.clientId;
  const upcoming =
    (booking.status ?? "confirmed") === "confirmed" && booking.startsAt.getTime() > Date.now();
  const showModify =
    upcoming &&
    Boolean(ownerId) &&
    canModifyBooking(
      {
        status: booking.status ?? "confirmed",
        startsAt: booking.startsAt,
        clientId: booking.clientId ?? ownerId ?? "",
      },
      ownerId ?? "",
    );
  const showCancel = upcoming;
  const cancelled = (booking.status ?? "confirmed") === "cancelled";
  const title = cancelled ? "Shoot cancelled." : updated ? "Shoot updated." : "You're all set.";
  const subtitle = cancelled
    ? "Your appointment with Billy Kyle has been cancelled."
    : updated
      ? "Your upcoming shoot has been changed."
      : "Your shoot with Billy Kyle is confirmed.";
  const modifyHref = schedulingBookHref({
    modify: booking.id,
    address: booking.address,
    services,
    notes: booking.notes,
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
      <h1 className="text-[32px] font-bold leading-tight lg:text-[40px]">{title}</h1>
      <p className="mt-3 text-sm text-[#8e8e93]">{subtitle}</p>

      <dl className="mt-10 w-full text-left">
        {services.length > 0 ? (
          <div className="border-b border-white/10 py-4">
            <dt className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Services</dt>
            <dd className="mt-2">
              <ul className="flex flex-col gap-0.5">
                {services.map((service) => (
                  <li key={service} className="text-[15px]">
                    {service}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div className="border-b border-white/10 py-4">
          <dt className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Address</dt>
          <dd className="mt-2 text-[15px]">{booking.address}</dd>
        </div>
        <div className="border-b border-white/10 py-4">
          <dt className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">When</dt>
          <dd className="mt-2 text-[15px]">
            {when}
            <span className="mt-1 block text-sm text-[#8e8e93]">
              {duration} · {zone}
            </span>
          </dd>
        </div>
        {notes ? (
          <div className="border-b border-white/10 py-4">
            <dt className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Notes</dt>
            <dd className="mt-2 text-[15px]">{notes}</dd>
          </div>
        ) : null}
        {accessCodes ? (
          <div className="border-b border-white/10 py-4">
            <dt className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Access</dt>
            <dd className="mt-2 text-[15px]">{accessCodes}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-10 flex w-full flex-col items-center gap-4">
        {showModify || showCancel ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            {showModify ? (
              <Link
                href={modifyHref}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-white text-base font-medium text-black"
              >
                Modify
              </Link>
            ) : null}
            {showCancel ? (
              <CancelBookingForm
                bookingId={booking.id}
                clientId={booking.clientId}
                className="flex h-12 w-full items-center justify-center rounded-xl border border-white text-base font-medium text-white"
              />
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href={CLIENT_SCHEDULING} className="text-sm text-[#8e8e93]">
            Back to Scheduling
          </Link>
          <Link href={CLIENT_HOME} className="text-sm text-[#8e8e93]">
            Home
          </Link>
          {updated && !cancelled ? null : (
            <Link href={CLIENT_SCHEDULING} className="text-sm text-[#8e8e93]">
              Book another
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
