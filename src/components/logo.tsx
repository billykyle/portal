import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
  variant?: "white" | "black";
  /** header = nav mark, splash = invite/admin splash mark */
  size?: "header" | "splash";
};

const SIZE = {
  header: "h-11 w-auto max-h-11",
  splash: "h-auto w-[188px] max-w-[68vw]",
} as const;

/** Official BK monogram. Always object-contain — never stretch. */
export function BkMark({
  className,
  title = "Billy Kyle",
  variant = "white",
  size = "header",
}: LogoProps) {
  const src = variant === "black" ? "/brand/bk-logo.png" : "/brand/bk-logo-white.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      className={cn("block object-contain", SIZE[size], className)}
    />
  );
}
