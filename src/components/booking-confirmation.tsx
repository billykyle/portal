import Link from "next/link";
import {
  BookingModifyCancelActions,
  bookingPrimaryButtonClass,
} from "@/components/booking-actions";
import { CLIENT_SCHEDULING } from "@/lib/routes";
import { canModifyBooking } from "@/lib/scheduling/bookings";
import { bookingConfirmationCopy, type BookingSyncIssue } from "@/lib/scheduling/booking-sync";
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
  issue,
  billyNotified = true,
}: {
  booking: BookingConfirmationDetails;
  timeZone: string;
  updated?: boolean;
  clientId?: string;
  issue?: BookingSyncIssue | null;
  billyNotified?: boolean;
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
  const copy = bookingConfirmationCopy({
    cancelled,
    updated,
    issue,
    billyNotified,
  });
  const title = copy.title;
  const subtitle = copy.subtitle;
  const modifyHref = schedulingBookHref({ modify: booking.id });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
      <h1 className="text-[32px] font-bold leading-tight lg:text-[40px]">{title}</h1>
      <p className="mt-3 text-sm text-[#8e8e93]">{subtitle}</p>
      {copy.notices.map((notice) => (
        <p
          key={notice}
          role="alert"
          className="mt-5 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-left text-[15px] text-white"
        >
          {notice}
        </p>
      ))}

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

      <div className="mt-10 flex w-full flex-col items-center gap-3">
        <BookingModifyCancelActions
          modifyHref={modifyHref}
          bookingId={booking.id}
          clientId={booking.clientId}
          showModify={showModify}
          showCancel={showCancel}
        />
        <Link href={CLIENT_SCHEDULING} className={bookingPrimaryButtonClass}>
          Back to Scheduling
        </Link>
      </div>
    </div>
  );
}
