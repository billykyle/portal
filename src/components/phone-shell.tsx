import { cn } from "@/lib/utils";

/** Page title shared by library, scheduling, account, and auth. */
export const pageTitleClass = "text-[28px] font-bold leading-tight lg:text-[32px]";

/** Uppercase label text. No margin, so headers and definition titles can share it. */
export const sectionLabelTextClass = "text-sm uppercase tracking-[0.14em] text-[#8e8e93]";

/** Uppercase section label above a list or form. */
export const sectionLabelClass = `mb-4 ${sectionLabelTextClass}`;

/** Space under a content heading (client name, record title) before the first block. */
export const pageHeadingWrapClass = "mb-8 lg:mb-10";

/**
 * Two desktop columns, one stack below `lg`.
 * Scheduling (Book a shoot | Upcoming) and Account share this.
 */
export const desktopSplitClass =
  "grid gap-10 pb-16 lg:grid-cols-2 lg:items-start lg:gap-x-12 xl:gap-x-16";

/** Bottom inset for a page or admin section stack. */
export const pageStackClass = "pb-16";

/**
 * Readable form width. The phone shell is narrower than `max-w-md`,
 * so this does not change the phone. Desktop fields get a little more room.
 */
export const formMeasureClass = "w-full max-w-md lg:max-w-lg";

/** Search or toolbar sitting on the same edges as the list under it. */
export const listSearchClass = "mb-4 lg:mb-6";

/** Shoot rows: a stack on the phone, cards that fill the shell on desktop. */
export const shootCardGridClass = "flex flex-col lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3";

/**
 * One shell for every page. Header and content share these edges.
 * Phone: 430px, or `max-w-xl` when `wide`.
 * Tablet (`md`): reading column.
 * Desktop grows with the viewport — 1120 at `lg`, 1440 at `xl`, 1680 at `2xl` —
 * so 1280, 1440, and 1920 are neither a narrow strip nor edge-to-edge sprawl.
 * Forms stay in FormColumn so fields do not run the full width.
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
          "md:max-w-3xl md:px-8",
          "lg:max-w-[1120px] lg:px-10",
          "xl:max-w-[1440px] xl:px-12",
          "2xl:max-w-[1680px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Readable form width. On a phone this is the full shell.
 * `center` sits a single form under the centered BK mark on wide screens.
 * Pass `lg:max-w-none` when the form should fill its column (scheduling, times).
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
  return (
    <div className={cn(formMeasureClass, center && "mx-auto", className)}>{children}</div>
  );
}
