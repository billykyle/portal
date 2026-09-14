import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";

/** Shared phone-first splash: logo, subtitle, then form (invite or admin). */
export function SplashScreen({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <PhoneShell className="px-6">
      <div className="flex flex-1 flex-col items-center justify-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full flex-col items-center">
          <BkMark size="splash" />
          <p className="mt-4 text-[15px] font-normal tracking-normal text-[#c7c7cc]">
            {subtitle}
          </p>
          <div className="mt-16 w-full">{children}</div>
        </div>
      </div>
    </PhoneShell>
  );
}
