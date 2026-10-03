import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminBookShootForm } from "@/components/forms/admin-book-shoot-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { listClientRows } from "@/lib/admin/clients";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";
import { listAdminBookings } from "@/lib/scheduling/bookings";
import { placesConfigured } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Book a shoot",
};

export const maxDuration = 300;

export default async function AdminHomeBookPage() {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const [rows, bookingRows] = await Promise.all([listClientRows(), listAdminBookings()]);

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Book a shoot</h1>
      <div className={`${pageStackClass} ${formMeasureClass}`}>
        <AdminBookShootForm
          placesConfigured={placesConfigured()}
          clients={rows.map((client) => ({
            id: client.id,
            displayName: client.displayName,
            company: client.company,
            inviteCode: client.inviteCode,
          }))}
          jobs={bookingRows.flatMap((job) =>
            job.status === "confirmed" && job.startsAt && job.endsAt
              ? [{ start: job.startsAt.toISOString(), end: job.endsAt.toISOString() }]
              : [],
          )}
        />
      </div>
    </PhoneShell>
  );
}
