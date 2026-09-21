import { BookingModifyCancelActions } from "@/components/booking-actions";
import { canModifyBooking } from "@/lib/scheduling/bookings";
import { adminBookingNotices } from "@/lib/scheduling/booking-sync";
import { bookingServiceList, formatBookingServices } from "@/lib/scheduling/services";
import { formatBookingWhen } from "@/lib/scheduling/slots";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export type BookingListItem = {
  id: string;
  address: string;
  service?: string | null;
  services?: string[] | null;
  startsAt: Date;
  endsAt: Date;
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
}: {
  bookings: BookingListItem[];
  emptyLabel: string;
  timeZone: string;
  showClient?: boolean;
  allowCancel?: boolean;
  allowModify?: boolean;
  admin?: boolean;
  clientId?: string;
}) {
  if (bookings.length === 0) {
    return <p className="text-sm text-[#8e8e93]">{emptyLabel}</p>;
  }

  return (
    <ul>
      {bookings.map((booking) => {
        const upcoming = booking.status === "confirmed" && booking.startsAt.getTime() > Date.now();
        const services = bookingServiceList(booking);
        const notices = admin || showClient ? adminBookingNotices(booking) : [];
        const showModify =
          Boolean(allowModify) &&
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
          <li key={booking.id} className="border-b border-white/10 py-4">
            <p className="text-[15px] font-medium">{booking.address}</p>
            <p className="mt-0.5 text-[15px]">
              {formatBookingWhen(booking.startsAt, booking.endsAt, timeZone)}
              {booking.status !== "confirmed" ? ` · ${booking.status}` : ""}
            </p>
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
            {allowCancel && upcoming ? (
              <div className="mt-3">
                <BookingModifyCancelActions
                  modifyHref={
                    showModify
                      ? schedulingBookHref({
                          modify: booking.id,
                          address: booking.address,
                          services,
                          notes: booking.notes,
                        })
                      : undefined
                  }
                  bookingId={booking.id}
                  clientId={booking.clientId}
                  fromAdmin={admin}
                  showModify={showModify}
                  showCancel
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
