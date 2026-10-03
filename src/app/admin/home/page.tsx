import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminClientDirectory } from "@/components/admin-client-directory";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { BookingList, QueuedBookingList } from "@/components/booking-list";
import { AdminBookShootForm } from "@/components/forms/admin-book-shoot-form";
import { MaintenanceNoticeForm } from "@/components/forms/maintenance-notice-form";
import { MintClientForm } from "@/components/forms/mint-client-form";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { clientCounts } from "@/lib/admin/clients";
import { signedUpMemberCount } from "@/lib/admin/member-count";
import { CLIENT_SORT_COOKIE, parseClientSort, sortClients } from "@/lib/admin/client-sort";
import { sortByVisibleLabel } from "@/lib/admin/sections";
import { nasSyncPageNotice } from "@/lib/admin/sync-notice";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients } from "@/lib/db/schema";
import { directoryLogins } from "@/lib/user-portals";
import { isNasUnreachableError, readableNasError } from "@/lib/nas-connect";
import { ADMIN_HOME } from "@/lib/routes";
import { formatEtDateTimeLocal } from "@/lib/maintenance";
import { getMaintenanceNotice } from "@/lib/maintenance-store";
import { listAdminBookings, splitActiveBookings } from "@/lib/scheduling/bookings";
import { adminBookingHref } from "@/lib/scheduling/urls";
import { placesConfigured, schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Home",
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

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    syncError?: string;
    minted?: string;
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
    cancelled?: string;
    updated?: string;
    q?: string;
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
  const {
    error,
    syncError,
    minted,
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
    cancelled,
    updated,
    q,
    maintenance,
    maintenanceError,
    emailed,
    emailFailed,
  } = await searchParams;
  const query = (q ?? "").trim();
  const needle = query.toLowerCase();
  const [rows, logins, counts, confirmedJobs, bookingRows, notice, cookieStore] = await Promise.all([
    db.select().from(clients).orderBy(desc(clients.createdAt)),
    directoryLogins(),
    clientCounts(),
    db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(eq(bookings.status, "confirmed")),
    listAdminBookings(),
    getMaintenanceNotice(),
    cookies(),
  ]);
  const sort = parseClientSort(cookieStore.get(CLIENT_SORT_COOKIE)?.value);
  const syncNotice = nasSyncPageNotice({ error, syncError });
  const syncNote =
    emailSkipped && isNasUnreachableError(emailSkipped) ? readableNasError(emailSkipped) : emailSkipped;
  const loginsByClient = new Map<string, typeof logins>();
  for (const login of logins) {
    const list = loginsByClient.get(login.clientId) ?? [];
    list.push(login);
    loginsByClient.set(login.clientId, list);
  }
  const matched = needle
    ? rows.filter((client) => {
        const haystack = [
          client.inviteCode,
          client.displayName,
          client.company,
          client.primaryEmail,
          ...(loginsByClient.get(client.id) ?? []).flatMap((login) => [
            login.email,
            login.firstName,
            login.lastName,
            login.phone,
          ]),
        ]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();
        return haystack.includes(needle);
      })
    : rows;
  const visible = sortClients(
    matched.map((client) => ({
      ...client,
      shootCount: counts.shoots.get(client.id) ?? 0,
      memberCount: signedUpMemberCount(loginsByClient.get(client.id)),
    })),
    sort,
  );
  const { queued, upcoming, past } = splitActiveBookings(bookingRows);
  const hours = schedulingHours();
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
  const homeSections: { id: string; label: string; children: ReactNode }[] = [
    {
      id: "clients:book-shoot",
      label: "Book a shoot",
      children: (
        <AdminBookShootForm
          placesConfigured={placesConfigured()}
          clients={rows.map((client) => ({
            id: client.id,
            displayName: client.displayName,
            company: client.company,
            inviteCode: client.inviteCode,
          }))}
          jobs={confirmedJobs.flatMap((job) =>
            job.startsAt && job.endsAt
              ? [{ start: job.startsAt.toISOString(), end: job.endsAt.toISOString() }]
              : [],
          )}
        />
      ),
    },
    {
      id: "home:maintenance",
      label: "Maintenance notice",
      children: (
        <div className={formMeasureClass}>
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
      ),
    },
    {
      id: "clients:nas-sync",
      label: "NAS sync",
      children: (
        <div className={formMeasureClass}>
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
      ),
    },
    {
      id: "clients:create-client",
      label: "Create client",
      children: (
        <div className={formMeasureClass}>
          <MintClientForm minted={minted} />
        </div>
      ),
    },
    {
      id: "clients:all",
      label: "All clients",
      children: (
        <AdminClientDirectory
          rowsEmpty={rows.length === 0}
          visible={visible}
          query={query}
          sort={sort}
          searchAction={ADMIN_HOME}
        />
      ),
    },
    {
      id: "bookings:upcoming",
      label: "Upcoming",
      children: (
        <BookingList
          bookings={upcoming}
          emptyLabel="No upcoming bookings."
          timeZone={hours.timeZone}
          showClient
          allowCancel
          allowModify
          admin
          columns={2}
        />
      ),
    },
    {
      id: "bookings:past",
      label: "Past",
      children: (
        <BookingList
          bookings={past}
          emptyLabel="No past bookings."
          timeZone={hours.timeZone}
          showClient
          allowModify
          admin
          columns={2}
        />
      ),
    },
  ];
  if (queued.length > 0) {
    homeSections.push({
      id: "bookings:queue",
      label: "Queue",
      children: (
        <QueuedBookingList
          bookings={queued}
          showClient
          scheduleHref={(booking) => adminBookingHref(booking.id)}
        />
      ),
    });
  }

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Home</h1>
      {syncNotice.topError ? <p className="mb-6 text-sm text-[#a1a1a1]">{syncNotice.topError}</p> : null}
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {updated ? <p className="mb-6 text-sm text-white">Shoot updated.</p> : null}
      <div className={pageStackClass}>
        {sortByVisibleLabel(homeSections).map((section) => (
          <AdminSection
            key={section.id}
            id={section.id}
            label={section.label}
            defaultOpen={false}
            remember={false}
          >
            {section.children}
          </AdminSection>
        ))}
      </div>
    </PhoneShell>
  );
}
