import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { MaintenanceNoticeForm } from "@/components/forms/maintenance-notice-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { formatEtDateTimeLocal } from "@/lib/maintenance";
import { getMaintenanceNotice } from "@/lib/maintenance-store";

export const metadata: Metadata = {
  title: "Maintenance notice",
};

/** Emailing every client can take longer than a normal page render. */
export const maxDuration = 300;

export default async function AdminHomeMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{
    maintenance?: string;
    maintenanceError?: string;
    emailed?: string;
    emailFailed?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { maintenance, maintenanceError, emailed, emailFailed } = await searchParams;
  const notice = await getMaintenanceNotice();
  const emailedCount = emailed == null ? null : Number(emailed);
  const failedCount = Number(emailFailed ?? "0");
  const emailedMessage =
    emailedCount == null || !Number.isFinite(emailedCount)
      ? undefined
      : emailedCount === 0 && failedCount === 0
        ? "No clients to email."
        : `Emailed ${emailedCount} client${emailedCount === 1 ? "" : "s"}.${
            failedCount > 0 ? ` ${failedCount} failed.` : ""
          }`;

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Maintenance notice</h1>
      <div className={`${pageStackClass} ${formMeasureClass}`}>
        <MaintenanceNoticeForm
          message={notice?.message ?? ""}
          startsAt={notice ? formatEtDateTimeLocal(notice.startsAt) : ""}
          endsAt={notice ? formatEtDateTimeLocal(notice.endsAt) : ""}
          saved={maintenance === "saved" ? "Saved." : undefined}
          cleared={maintenance === "cleared" ? "Cleared." : undefined}
          emailed={emailedMessage}
          error={maintenanceError}
        />
      </div>
    </PhoneShell>
  );
}
