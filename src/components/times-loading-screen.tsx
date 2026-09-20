import { PhoneShell } from "@/components/phone-shell";
import { TIMES_LOADING_COPY } from "@/lib/scheduling/times-loading";

/** Full-page interstitial while calendar + drive-time availability is computed. */
export function TimesLoadingScreen() {
  return (
    <PhoneShell>
      <div
        className="flex flex-1 flex-col items-center justify-center text-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-white lg:size-12"
          aria-hidden
        />
        <p className="mt-6 text-[17px] font-medium text-white lg:text-[19px]">{TIMES_LOADING_COPY}</p>
      </div>
    </PhoneShell>
  );
}
