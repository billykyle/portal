import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { nasSyncPageNotice } from "@/lib/admin/sync-notice";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { isNasUnreachableError, readableNasError } from "@/lib/nas-connect";
import { formatNasSyncSummary, nasSyncEmailNote } from "@/lib/nas-sync-job";
import { latestNasSyncJob, recoverNasSyncJobIfStale, toPublicNasSyncJob } from "@/lib/nas-sync-store";

export const metadata: Metadata = {
  title: "NAS sync",
};

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
  const params = await searchParams;
  const syncNotice = nasSyncPageNotice({ error: params.error, syncError: params.syncError });
  const legacyNote =
    params.emailSkipped && isNasUnreachableError(params.emailSkipped)
      ? readableNasError(params.emailSkipped)
      : params.emailSkipped;
  const latest = await latestNasSyncJob();
  const recovered = latest ? await recoverNasSyncJobIfStale(latest) : null;
  const initialJob = recovered ? toPublicNasSyncJob(recovered.job) : null;
  const legacyStatus =
    !initialJob && params.synced
      ? formatNasSyncSummary({
          skipped: false,
          clientsCreated: Number(params.clients) || 0,
          shootsCreated: Number(params.shoots) || 0,
          mediaImported: Number(params.photos) || 0,
          mediaUpdated: Number(params.refreshed) || 0,
          clientsReused: Number(params.reusedClients) || 0,
          shootsReused: Number(params.reusedShoots) || 0,
          ready: Number(params.ready) || 0,
          mediaRemoved: Number(params.removedPhotos) || 0,
          shootsRemoved: Number(params.removedShoots) || 0,
          warnings: Array.from({ length: Number(params.warnings) || 0 }, () => "skipped"),
        })
      : undefined;

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">NAS sync</h1>
      {syncNotice.topError ? <p className="mb-6 text-sm text-[#a1a1a1]">{syncNotice.topError}</p> : null}
      <div className={`${pageStackClass} ${formMeasureClass}`}>
        <SyncNasForm
          initialJob={initialJob}
          error={syncNotice.syncError || undefined}
          status={legacyStatus}
          note={
            initialJob?.summary
              ? nasSyncEmailNote(initialJob.summary.warnings)
              : legacyNote || undefined
          }
        />
      </div>
    </PhoneShell>
  );
}
