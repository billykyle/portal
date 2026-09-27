"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { emailConfigured, sendEmail } from "@/lib/email";
import {
  buildMaintenanceEmail,
  maintenanceRecipients,
  parseEtDateTimeLocal,
} from "@/lib/maintenance";
import {
  clearMaintenanceNotice,
  getMaintenanceNotice,
  listClientPrimaryEmails,
  saveMaintenanceNotice,
} from "@/lib/maintenance-store";
import { ADMIN_HOME } from "@/lib/routes";

const EMAIL_GAP_MS = 200;

function adminHomeUrl(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `${ADMIN_HOME}?${query.toString()}`;
}

function refreshNotice() {
  revalidatePath("/", "layout");
}

export async function saveMaintenanceNoticeAction(formData: FormData) {
  if (!(await getAdminSession())) redirect("/admin");
  const message = String(formData.get("message") ?? "").trim();
  const startsAt = parseEtDateTimeLocal(String(formData.get("startsAt") ?? ""));
  const endsAt = parseEtDateTimeLocal(String(formData.get("endsAt") ?? ""));
  if (!message) redirect(adminHomeUrl({ maintenanceError: "Message is required." }));
  if (!startsAt || !endsAt) redirect(adminHomeUrl({ maintenanceError: "Start and end are required." }));
  if (startsAt.getTime() >= endsAt.getTime()) {
    redirect(adminHomeUrl({ maintenanceError: "End must be after start." }));
  }
  await saveMaintenanceNotice({ message, startsAt, endsAt });
  refreshNotice();
  redirect(adminHomeUrl({ maintenance: "saved" }));
}

export async function clearMaintenanceNoticeAction() {
  if (!(await getAdminSession())) redirect("/admin");
  await clearMaintenanceNotice();
  refreshNotice();
  redirect(adminHomeUrl({ maintenance: "cleared" }));
}

export async function emailMaintenanceNoticeAction() {
  if (!(await getAdminSession())) redirect("/admin");
  const notice = await getMaintenanceNotice();
  if (!notice) redirect(adminHomeUrl({ maintenanceError: "Save a notice first." }));
  if (!emailConfigured()) redirect(adminHomeUrl({ maintenanceError: "Email is not configured." }));
  const recipients = maintenanceRecipients(await listClientPrimaryEmails());
  const message = buildMaintenanceEmail(notice);
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, EMAIL_GAP_MS));
    const result = await sendEmail({
      to: recipients[index]!,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.sent) sent += 1;
    else failed += 1;
  }
  redirect(adminHomeUrl({ emailed: String(sent), emailFailed: String(failed) }));
}
