import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  className,
  ...props
}: React.ComponentProps<"input"> & { id: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[16px] font-normal text-white">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={cn(
          "h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function SelectField({
  id,
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { id: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[16px] font-normal text-white">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={id}
          className={cn(
            "h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 pr-10 text-base text-white outline-none [color-scheme:dark]",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#8e8e93]"
        />
      </div>
    </div>
  );
}

export function SubmitButton({
  children,
  disabled,
  className,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cn(
        "flex h-12 w-full appearance-none items-center justify-center rounded-xl border-0 bg-white text-base font-medium text-black disabled:bg-[#c7c7cc] disabled:text-black/45",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-[#a1a1a1]">{message}</p>;
}
