import { cancelBooking } from "@/lib/actions/scheduling";

export function CancelBookingForm({
  bookingId,
  fromAdmin = false,
  clientId,
  className,
}: {
  bookingId: string;
  fromAdmin?: boolean;
  clientId?: string;
  className?: string;
}) {
  return (
    <form action={cancelBooking} className={className ? "w-full" : undefined}>
      <input type="hidden" name="bookingId" value={bookingId} />
      {fromAdmin ? <input type="hidden" name="fromAdmin" value="1" /> : null}
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <button type="submit" className={className ?? "text-sm text-[#8e8e93]"}>
        Cancel
      </button>
    </form>
  );
}
