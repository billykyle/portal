import { cn } from "@/lib/utils";

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
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
