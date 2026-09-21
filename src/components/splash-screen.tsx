import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";

/** Shared splash: stacked on phone, logo | form on desktop. */
export function SplashScreen({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <PhoneShell className="px-6">
      <div className="flex flex-1 flex-col items-center justify-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:flex-row lg:items-center lg:justify-between lg:gap-16 xl:gap-24">
        <div className="flex flex-col items-center lg:items-start">
          <BkMark size="splash" />
          <p className="mt-4 text-[15px] font-normal tracking-normal text-[#c7c7cc]">
            {subtitle}
          </p>
        </div>
        <div className="mt-16 w-full lg:mt-0 lg:max-w-md">{children}</div>
      </div>
    </PhoneShell>
  );
}
