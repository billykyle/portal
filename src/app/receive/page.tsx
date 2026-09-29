import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { UploadForm } from "@/components/upload-form";
import { hostnameOf, isLocalHostname, isUploadHostname } from "@/lib/hosts";

export const metadata: Metadata = {
  title: { absolute: "Billy Kyle" },
};

export const dynamic = "force-dynamic";

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const host = hostnameOf((await headers()).get("host") ?? "");
  if (!isUploadHostname(host) && !isLocalHostname(host)) notFound();

  const preview = (await searchParams).preview;
  const initial =
    process.env.NODE_ENV !== "production" && (preview === "uploading" || preview === "done")
      ? preview
      : "form";
  return <UploadForm initial={initial} />;
}
