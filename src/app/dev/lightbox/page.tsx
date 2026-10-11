import { notFound } from "next/navigation";
import { LightboxHarness } from "./harness";

export default async function LightboxHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ at?: string; open?: string; shape?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { at, open, shape } = await searchParams;
  const n = at && /^\d+$/.test(at) ? Number(at) : 1;
  const id = String(Math.min(89, Math.max(1, n))).padStart(2, "0");
  return (
    <LightboxHarness initialId={id} startOpen={open !== "0"} shape={shape === "portrait" ? "portrait" : "landscape"} />
  );
}
