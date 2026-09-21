import { PhoneShell } from "@/components/phone-shell";
import { TIMES_LOADING_COPY } from "@/lib/scheduling/times-loading";

/** Spinner + locked sentence. Use inside an existing phone shell. */
export function TimesLoadingStatus() {
  return (
    <div
      className="flex min-h-[40vh] flex-1 flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="size-11 animate-spin rounded-full border-[3px] border-white/15 border-t-white lg:size-12"
        aria-hidden
      />
      <p className="mt-6 text-[17px] font-medium text-white lg:text-[19px]">{TIMES_LOADING_COPY}</p>
    </div>
  );
}

/** Full-page interstitial while calendar + drive-time availability is computed. */
export function TimesLoadingScreen() {
  return (
    <PhoneShell>
      <TimesLoadingStatus />
    </PhoneShell>
  );
}
