import { queueBooking } from "@/lib/actions/scheduling";

export function QueueBookingForm({ bookingId, className }: { bookingId: string; className?: string }) {
  return (
    <form action={queueBooking} className="w-full">
      <input type="hidden" name="bookingId" value={bookingId} />
      <button type="submit" className={className ?? "text-sm text-[#8e8e93]"}>
        Queue
      </button>
    </form>
  );
}
