import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
};

/** BK monogram matching the official mark supplied for the portal. */
export function BkMark({ className, title = "Billy Kyle" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 260 180"
      fill="currentColor"
      role="img"
      aria-label={title}
      className={cn("block", className)}
    >
      <title>{title}</title>
      <path
        fillRule="evenodd"
        d="M18 8h90c28 0 47 16 47 42 0 16-8 29-24 36 18 7 29 21 29 42 0 30-21 48-56 48H18C8 176 0 168 0 158V26C0 16 8 8 18 8Zm50 28h36c13 0 21 7 21 18s-8 18-21 18H68c-10 0-16-6-16-16 0-11 6-20 16-20Zm0 72h40c14 0 23 8 23 21s-9 21-23 21H68c-10 0-16-7-16-18 0-13 6-24 16-24Z"
      />
      <path d="M176 8h32v64L248 8h32l-56 76 64 88h-36l-28-40-20 40h-28V8Z" />
    </svg>
  );
}
