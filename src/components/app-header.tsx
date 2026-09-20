import type { ReactNode } from "react";
import { BkMark } from "@/components/logo";
import { cn } from "@/lib/utils";

/**
 * Portal chrome: BK mark is absolutely centered in the header bar so
 * left/right actions cannot shift it off the visual midpoint.
 */
export function AppHeader({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
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
  );
}
