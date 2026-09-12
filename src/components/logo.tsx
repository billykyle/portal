import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
  variant?: "white" | "black";
};

/** Official BK monogram. Always object-contain — never stretch. */
export function BkMark({ className, title = "Billy Kyle", variant = "white" }: LogoProps) {
  const src = variant === "black" ? "/brand/bk-logo.png" : "/brand/bk-logo-white.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={title} className={cn("block h-auto w-auto object-contain", className)} />
  );
}
