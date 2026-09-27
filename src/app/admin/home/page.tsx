import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminClientDirectory } from "@/components/admin-client-directory";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { BookingList } from "@/components/booking-list";
import { AdminBookShootForm } from "@/components/forms/admin-book-shoot-form";
import { MintClientForm } from "@/components/forms/mint-client-form";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { clientCounts } from "@/lib/admin/clients";
import { CLIENT_SORT_COOKIE, DEFAULT_CLIENT_SORT, parseClientSort, sortClients } from "@/lib/admin/client-sort";
import {
  ADMIN_SECTIONS_COOKIE,
  bookingsSectionForce,
  clientsSectionForce,
  parseOpenSections,
  sectionStartsOpen,
} from "@/lib/admin/sections";
import { nasSyncPageNotice } from "@/lib/admin/sync-notice";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users } from "@/lib/db/schema";
import { isNasUnreachableError, readableNasError } from "@/lib/nas-connect";
import { ADMIN_HOME } from "@/lib/routes";
import { listAdminBookings } from "@/lib/scheduling/bookings";
import { placesConfigured, schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Home",
};

/** Sync walks the share. Match the cron route so a live NAS is not cut off mid-run. */
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
  } = await searchParams;
  const query = (q ?? "").trim();
  const needle = query.toLowerCase();
  const [rows, logins, counts, cookieStore, confirmedJobs, bookingRows] = await Promise.all([
    db.select().from(clients).orderBy(desc(clients.createdAt)),
    db
      .select({
        clientId: users.clientId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      })
      .from(users),
    clientCounts(),
    cookies(),
    db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(eq(bookings.status, "confirmed")),
    listAdminBookings(),
  ]);
  const sort = parseClientSort(cookieStore.get(CLIENT_SORT_COOKIE)?.value);
  const openSections = parseOpenSections(cookieStore.get(ADMIN_SECTIONS_COOKIE)?.value);
  const syncNotice = nasSyncPageNotice({ error, syncError });
  const syncNote =
    emailSkipped && isNasUnreachableError(emailSkipped) ? readableNasError(emailSkipped) : emailSkipped;
  const sectionSignals = {
    query,
    sortIsDefault: sort === DEFAULT_CLIENT_SORT,
    minted: Boolean(minted),
    synced: Boolean(synced || emailSkipped),
    error: Boolean(syncNotice.topError),
    syncError: Boolean(syncNotice.syncError),
  };
  const bookingNotice = Boolean(cancelled || updated);
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
    })),
    sort,
  );
  const now = Date.now();
  const upcoming = bookingRows.filter((row) => row.startsAt.getTime() >= now);
  const past = bookingRows.filter((row) => row.startsAt.getTime() < now);
  const hours = schedulingHours();

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Home</h1>
      {syncNotice.topError ? <p className="mb-6 text-sm text-[#a1a1a1]">{syncNotice.topError}</p> : null}
      {cancelled ? <p className="mb-6 text-sm text-white">Booking cancelled.</p> : null}
      {updated ? <p className="mb-6 text-sm text-white">Shoot updated.</p> : null}
      <div className={pageStackClass}>
        <AdminSection
          id="clients:book-shoot"
          label="Book a shoot"
          defaultOpen={sectionStartsOpen(openSections, "clients:book-shoot", false)}
        >
          <AdminBookShootForm
            placesConfigured={placesConfigured()}
            clients={rows.map((client) => ({
              id: client.id,
              displayName: client.displayName,
              company: client.company,
              inviteCode: client.inviteCode,
            }))}
            jobs={confirmedJobs.map((job) => ({
              start: job.startsAt.toISOString(),
              end: job.endsAt.toISOString(),
            }))}
          />
        </AdminSection>
        <AdminSection
          id="clients:nas-sync"
          label="NAS sync"
          defaultOpen={sectionStartsOpen(
            openSections,
            "clients:nas-sync",
            clientsSectionForce("clients:nas-sync", sectionSignals),
          )}
        >
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
        </AdminSection>
        <AdminSection
          id="clients:create-client"
          label="Create client"
          defaultOpen={sectionStartsOpen(
            openSections,
            "clients:create-client",
            clientsSectionForce("clients:create-client", sectionSignals),
          )}
        >
          <div className={formMeasureClass}>
            <MintClientForm minted={minted} />
          </div>
        </AdminSection>
        <AdminSection
          id="clients:all"
          label="All clients"
          defaultOpen={sectionStartsOpen(
            openSections,
            "clients:all",
            clientsSectionForce("clients:all", sectionSignals),
          )}
        >
          <AdminClientDirectory
            rowsEmpty={rows.length === 0}
            visible={visible}
            query={query}
            sort={sort}
            searchAction={ADMIN_HOME}
          />
        </AdminSection>
        <AdminSection
          id="bookings:upcoming"
          label="Upcoming"
          defaultOpen={sectionStartsOpen(
            openSections,
            "bookings:upcoming",
            bookingsSectionForce("bookings:upcoming", { notice: bookingNotice }),
          )}
        >
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
        </AdminSection>
        <AdminSection
          id="bookings:past"
          label="Past"
          defaultOpen={sectionStartsOpen(openSections, "bookings:past", false)}
        >
          <BookingList
            bookings={past}
            emptyLabel="No past bookings."
            timeZone={hours.timeZone}
            showClient
            columns={2}
          />
        </AdminSection>
      </div>
    </PhoneShell>
  );
}
