import { cn } from "@/lib/utils";

/** Page title shared by library, scheduling, account, and auth. */
export const pageTitleClass = "text-[28px] font-bold leading-tight lg:text-[32px]";

/** Uppercase section label above a list or form. */
export const sectionLabelClass = "mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]";

/**
 * One shell, two viewports — CSS width is the source of truth.
 * Phone / narrow: existing 430px (or xl when `wide`) cage.
 * `md`: slightly wider reading column (iPad portrait).
 * `lg` / `xl`: desktop content width. Page grids split this;
 * forms stay in FormColumn so fields do not run edge to edge.
 */
export function PhoneShell({
  children,
  className,
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full flex-col px-6",
          wide ? "max-w-xl" : "max-w-[430px]",
          "md:max-w-3xl",
          "lg:max-w-[1100px] lg:px-10",
          "xl:max-w-[1280px] xl:px-12",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Readable form width (~28rem). On a phone this is the full shell.
 * `center` sits a single form under the centered BK mark on wide screens.
 */
export function FormColumn({
  children,
  className,
  center = false,
}: {
  children: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return <div className={cn("w-full max-w-md", center && "mx-auto", className)}>{children}</div>;
}
