import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { nasSyncPageNotice } from "@/lib/admin/sync-notice";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { isNasUnreachableError, readableNasError } from "@/lib/nas-connect";

export const metadata: Metadata = {
  title: "NAS sync",
};

/** Manual Sync from NAS walks the share. Keep the function alive long enough to finish. */
export const maxDuration = 300;

function syncSummary(input: {
  createdClients?: string;
  shoots?: string;
  photos?: string;
  refreshed?: string;
  reusedClients?: string;
  reusedShoots?: string;
  ready?: string;
  removedPhotos?: string;
  removedShoots?: string;
  warnings?: string;
}) {
  const createdClients = input.createdClients ?? "0";
  const shoots = input.shoots ?? "0";
  const photos = input.photos ?? "0";
  const reusedClients = input.reusedClients ?? "0";
  const reusedShoots = input.reusedShoots ?? "0";
  const lead = `Sync finished. ${createdClients} new client${createdClients === "1" ? "" : "s"}, ${shoots} new shoot${shoots === "1" ? "" : "s"}, ${photos} new photo${photos === "1" ? "" : "s"}.`;
  const reused = `Reused ${reusedClients} client${reusedClients === "1" ? "" : "s"} / ${reusedShoots} shoot${reusedShoots === "1" ? "" : "s"}`;
  const extra: string[] = [];
  if (input.refreshed && input.refreshed !== "0") extra.push(`, refreshed ${input.refreshed} stills`);
  if (input.ready && input.ready !== "0") {
    extra.push(` · ${input.ready} shoot${input.ready === "1" ? "" : "s"} ready to deliver`);
  }
  if (input.removedPhotos && input.removedPhotos !== "0") {
    extra.push(` · removed ${input.removedPhotos} file${input.removedPhotos === "1" ? "" : "s"} gone from NAS`);
  }
  if (input.removedShoots && input.removedShoots !== "0") {
    extra.push(` · removed ${input.removedShoots} portal-only shoot${input.removedShoots === "1" ? "" : "s"}`);
  }
  if (input.warnings && input.warnings !== "0") {
    extra.push(` · ${input.warnings} skipped folder${input.warnings === "1" ? "" : "s"}`);
  }
  return `${lead} ${reused}${extra.join("")}.`;
}

export default async function AdminHomeNasSyncPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    syncError?: string;
    synced?: string;
    clients?: string;
    shoots?: string;
    photos?: string;
    refreshed?: string;
    reusedClients?: string;
    reusedShoots?: string;
    warnings?: string;
    emailSkipped?: string;
    ready?: string;
    removedShoots?: string;
    removedPhotos?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const {
    error,
    syncError,
    synced,
    clients: createdClients,
    shoots,
    photos,
    refreshed,
    reusedClients,
    reusedShoots,
    warnings,
    emailSkipped,
    ready,
    removedShoots,
    removedPhotos,
  } = await searchParams;
  const syncNotice = nasSyncPageNotice({ error, syncError });
  const syncNote =
    emailSkipped && isNasUnreachableError(emailSkipped) ? readableNasError(emailSkipped) : emailSkipped;

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">NAS sync</h1>
      {syncNotice.topError ? <p className="mb-6 text-sm text-[#a1a1a1]">{syncNotice.topError}</p> : null}
      <div className={`${pageStackClass} ${formMeasureClass}`}>
        <SyncNasForm
          error={syncNotice.syncError || undefined}
          status={
            synced
              ? syncSummary({
                  createdClients,
                  shoots,
                  photos,
                  refreshed,
                  reusedClients,
                  reusedShoots,
                  ready,
                  removedPhotos,
                  removedShoots,
                  warnings,
                })
              : undefined
          }
          note={syncNote || undefined}
        />
      </div>
    </PhoneShell>
  );
}
