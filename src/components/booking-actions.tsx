import Link from "next/link";
import { CancelBookingForm } from "@/components/forms/cancel-booking-form";

export const bookingPrimaryButtonClass =
  "flex h-12 w-full items-center justify-center rounded-xl bg-white text-base font-medium text-black";
export const bookingSecondaryButtonClass =
  "flex h-12 w-full items-center justify-center rounded-xl border border-white text-base font-medium text-white";
export const bookingActionRowClass = "flex w-full flex-row gap-3";
export const bookingActionSlotClass = "min-w-0 flex-1";

export function BookingModifyCancelActions({
  modifyHref,
  bookingId,
  clientId,
  fromAdmin = false,
  showModify = false,
  showCancel = false,
}: {
  modifyHref?: string;
  bookingId: string;
  clientId?: string;
  fromAdmin?: boolean;
  showModify?: boolean;
  showCancel?: boolean;
}) {
  if (!showModify && !showCancel) return null;

  return (
    <div className={bookingActionRowClass}>
      {showModify && modifyHref ? (
        <div className={bookingActionSlotClass}>
          <Link href={modifyHref} className={bookingPrimaryButtonClass}>
            Modify
          </Link>
        </div>
      ) : null}
      {showCancel ? (
        <div className={bookingActionSlotClass}>
          <CancelBookingForm
            bookingId={bookingId}
            fromAdmin={fromAdmin}
            clientId={clientId}
            className={bookingSecondaryButtonClass}
          />
        </div>
      ) : null}
    </div>
  );
}
