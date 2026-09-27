import type { ReactNode } from "react";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { BkMark } from "@/components/logo";
import { maintenanceIsLive } from "@/lib/maintenance";
import { getMaintenanceNotice } from "@/lib/maintenance-store";
import { cn } from "@/lib/utils";

/**
 * Portal chrome: BK mark is absolutely centered in the header bar so
 * left/right actions cannot shift it off the visual midpoint.
 * A live maintenance notice sits under the bar.
 */
export async function AppHeader({
  left,
  right,
  className,
  surface = "client",
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  /** Admin pages show a small live indicator. Client and public pages show the banner. */
  surface?: "client" | "admin";
}) {
  const notice = await getMaintenanceNotice();
  const live = notice && maintenanceIsLive(notice, new Date()) ? notice : null;
  const token = live ? `${live.startsAt.toISOString()}|${live.endsAt.toISOString()}|${live.message}` : "";

  return (
    <>
      <header className={cn("relative flex min-h-[5.75rem] items-center py-6", className)}>
        <div className="z-10 flex min-w-0 flex-1 items-center justify-start pr-14">
          {left}
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">
            <BkMark size="header" />
          </div>
        </div>
        <div className="z-10 flex min-w-0 flex-1 items-center justify-end gap-4 pl-14">
          {right}
        </div>
      </header>
      {live && surface === "admin" ? (
        <p className="mb-4 text-xs text-[#8e8e93]">Maintenance notice is live</p>
      ) : null}
      {live && surface === "client" ? <MaintenanceBanner message={live.message} token={token} /> : null}
    </>
  );
}
