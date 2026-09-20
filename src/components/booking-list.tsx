import { CancelBookingForm } from "@/components/forms/cancel-booking-form";
import { bookingServiceList } from "@/lib/scheduling/services";
import { formatBookingWhen } from "@/lib/scheduling/slots";

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
  admin = false,
}: {
  bookings: BookingListItem[];
  emptyLabel: string;
  timeZone: string;
  showClient?: boolean;
  allowCancel?: boolean;
  admin?: boolean;
}) {
  if (bookings.length === 0) {
    return <p className="text-sm text-[#8e8e93]">{emptyLabel}</p>;
  }

  return (
    <ul>
      {bookings.map((booking) => {
        const upcoming = booking.status === "confirmed" && booking.startsAt.getTime() > Date.now();
        const services = bookingServiceList(booking);
        return (
          <li key={booking.id} className="border-b border-white/10 py-4">
            {services.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {services.map((service) => (
                  <li key={service} className="text-[15px]">
                    {service}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={services.length > 0 ? "text-sm text-[#8e8e93]" : "text-[15px]"}>
              {booking.address}
            </p>
            <p className="text-sm text-[#8e8e93]">
              {formatBookingWhen(booking.startsAt, booking.endsAt, timeZone)}
              {booking.status !== "confirmed" ? ` · ${booking.status}` : ""}
            </p>
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
            {allowCancel && upcoming ? (
              <div className="mt-2">
                <CancelBookingForm bookingId={booking.id} fromAdmin={admin} clientId={booking.clientId} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
