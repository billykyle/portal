import { cn } from "@/lib/utils";

/**
 * One shell, two viewports — CSS width is the source of truth.
 * Phone / narrow: existing 430px (or xl when `wide`) cage.
 * `md`: slightly wider reading column (iPad portrait).
 * `lg` / `xl`: desktop content width for horizontal layouts.
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

/** Keep auth fields readable after the phone cage lifts. */
export function FormColumn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("w-full md:max-w-md", className)}>{children}</div>;
}
