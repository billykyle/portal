import Link from "next/link";
import { BookingModifyCancelActions, bookingPrimaryButtonClass } from "@/components/booking-actions";
import { sectionLabelClass } from "@/components/phone-shell";
import { cn } from "@/lib/utils";
import { canAdminModifyBooking, canModifyBooking, canQueueUpcomingBooking } from "@/lib/scheduling/bookings";
import { adminBookingNotices } from "@/lib/scheduling/booking-sync";
import { bookingServiceList, formatBookingServices } from "@/lib/scheduling/services";
import { formatBookingWhen } from "@/lib/scheduling/slots";
import { adminBookingHref, schedulingBookHref } from "@/lib/scheduling/urls";

export type BookingListItem = {
  id: string;
  address: string;
  service?: string | null;
  services?: string[] | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  notes?: string | null;
  accessCodes?: string | null;
  calendarEventId?: string | null;
  syncIssue?: string | null;
  clientName?: string;
  inviteCode?: string;
  clientId?: string;
};

export function BookingList({
  bookings,
  emptyLabel,
  timeZone,
  showClient = false,
  allowCancel = false,
  allowModify = false,
  admin = false,
  clientId,
  columns = 1,
}: {
  bookings: BookingListItem[];
  emptyLabel: string;
  timeZone: string;
  showClient?: boolean;
  allowCancel?: boolean;
  allowModify?: boolean;
  admin?: boolean;
  clientId?: string;
  /** 2 puts cards side by side on desktop. Mobile stays a single stack. */
  columns?: 1 | 2;
}) {
  if (bookings.length === 0) {
    return <p className="text-sm text-[#8e8e93]">{emptyLabel}</p>;
  }

  return (
    <ul className={columns === 2 ? "lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12" : undefined}>
      {bookings.map((booking) => {
        const upcoming =
          booking.status === "confirmed" && booking.startsAt != null && booking.startsAt.getTime() > Date.now();
        const showQueue = admin && canQueueUpcomingBooking(booking);
        const services = bookingServiceList(booking);
        const notices = admin || showClient ? adminBookingNotices(booking) : [];
        const showModify = admin
          ? Boolean(allowModify) &&
            canAdminModifyBooking({
              status: booking.status,
              startsAt: booking.startsAt,
            })
          : Boolean(allowModify) &&
            Boolean(clientId) &&
            canModifyBooking(
              {
                status: booking.status,
                startsAt: booking.startsAt,
                clientId: booking.clientId ?? clientId ?? "",
              },
              clientId ?? "",
            );
        return (
          <li key={booking.id} className={cn("border-b border-white/10 py-4", columns === 2 && "min-w-0")}>
            <p className="text-[15px] font-medium">{booking.address}</p>
            {booking.startsAt && booking.endsAt ? (
              <p className="mt-0.5 text-[15px]">
                {formatBookingWhen(booking.startsAt, booking.endsAt, timeZone)}
                {booking.status !== "confirmed" ? ` · ${booking.status}` : ""}
              </p>
            ) : null}
            {services.length > 0 ? (
              <p className="mt-0.5 text-sm text-[#8e8e93]">{formatBookingServices(services)}</p>
            ) : null}
            {showClient && booking.clientName ? (
              <p className="text-sm text-[#8e8e93]">
                {booking.inviteCode ? `${booking.inviteCode} · ` : ""}
                {booking.clientName}
              </p>
            ) : null}
            {booking.notes ? <p className="mt-1 text-sm text-[#c7c7cc]">{booking.notes}</p> : null}
            {booking.accessCodes ? (
              <p className="text-sm text-[#8e8e93]">Access: {booking.accessCodes}</p>
            ) : null}
            {notices.map((notice) => (
              <p key={notice} className="text-sm text-[#8e8e93]">
                {notice}
              </p>
            ))}
            {(upcoming && (allowCancel || allowModify)) || (admin && showModify) || showQueue ? (
              <div className="mt-3">
                <BookingModifyCancelActions
                  modifyHref={
                    showModify
                      ? admin
                        ? adminBookingHref(booking.id)
                        : schedulingBookHref({ modify: booking.id })
                      : undefined
                  }
                  bookingId={booking.id}
                  clientId={booking.clientId}
                  fromAdmin={admin}
                  showModify={showModify}
                  showCancel={upcoming && (allowCancel || allowModify)}
                  showQueue={showQueue}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function QueuedBookingList({
  bookings,
  showClient = false,
  scheduleHref,
}: {
  bookings: BookingListItem[];
  showClient?: boolean;
  scheduleHref: (booking: BookingListItem) => string;
}) {
  if (bookings.length === 0) return null;
  return (
    <ul>
      {bookings.map((booking) => {
        const services = bookingServiceList(booking);
        const notices = showClient ? adminBookingNotices(booking) : [];
        return (
          <li key={booking.id} className="border-b border-white/10 py-4">
            <p className="text-[15px] font-medium">{booking.address}</p>
            {services.length > 0 ? (
              <p className="mt-0.5 text-sm text-[#8e8e93]">{formatBookingServices(services)}</p>
            ) : null}
            {showClient && booking.clientName ? (
              <p className="text-sm text-[#8e8e93]">
                {booking.inviteCode ? `${booking.inviteCode} · ` : ""}
                {booking.clientName}
              </p>
            ) : null}
            {booking.notes ? <p className="mt-1 text-sm text-[#c7c7cc]">{booking.notes}</p> : null}
            {notices.map((notice) => (
              <p key={notice} className="text-sm text-[#8e8e93]">
                {notice}
              </p>
            ))}
            <div className="mt-3">
              <Link href={scheduleHref(booking)} className={bookingPrimaryButtonClass}>
                Schedule a time
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Absent when the client has nothing queued. */
export function ClientQueueSection({ bookings }: { bookings: BookingListItem[] }) {
  if (bookings.length === 0) return null;
  return (
    <>
      <h2 className={sectionLabelClass}>Queue</h2>
      <QueuedBookingList
        bookings={bookings}
        scheduleHref={(booking) => schedulingBookHref({ modify: booking.id })}
      />
    </>
  );
}
