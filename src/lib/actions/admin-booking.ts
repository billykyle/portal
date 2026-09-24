"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";
import { createOverrideBooking } from "@/lib/scheduling/admin-book";
import { parseSchedulingServices } from "@/lib/scheduling/services";

export type AdminBookState = {
  ok: boolean;
  error?: string;
  message?: string;
  overlap?: string | null;
  calendar?: "written" | "failed" | "skipped";
  email?: "sent" | "failed";
};

export async function bookShootForClient(
  _prev: AdminBookState | undefined,
  formData: FormData,
): Promise<AdminBookState> {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();

  const services = parseSchedulingServices(formData.getAll("service"));
  const result = await createOverrideBooking({
    source: "admin-ui",
    client: String(formData.get("clientId") ?? ""),
    address: String(formData.get("address") ?? ""),
    services,
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/clients");
  revalidatePath("/admin/bookings");
  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);

  return {
    ok: true,
    message: `Booked ${result.startEt} for ${result.client.displayName}.`,
    overlap: result.overlapWarning,
    calendar: result.calendar,
    email: result.email,
  };
}
