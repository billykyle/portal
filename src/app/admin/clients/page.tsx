import { desc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { ClientSortSelect } from "@/components/client-sort-select";
import { AdminBookShootForm } from "@/components/forms/admin-book-shoot-form";
import { MintClientForm } from "@/components/forms/mint-client-form";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { clientCounts } from "@/lib/admin/clients";
import { CLIENT_SORT_COOKIE, DEFAULT_CLIENT_SORT, parseClientSort, sortClients } from "@/lib/admin/client-sort";
import { nasSyncPageNotice } from "@/lib/admin/sync-notice";
import { isNasUnreachableError, readableNasError } from "@/lib/nas-connect";
import {
  ADMIN_SECTIONS_COOKIE,
  clientsSectionForce,
  parseOpenSections,
  sectionStartsOpen,
} from "@/lib/admin/sections";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users } from "@/lib/db/schema";
import { placesConfigured } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Admin",
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

export default async function AdminClientsPage({
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
    removed?: string;
    removedShoots?: string;
    removedPhotos?: string;
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
    removed,
    removedShoots,
    removedPhotos,
    q,
  } = await searchParams;
  const query = (q ?? "").trim();
  const needle = query.toLowerCase();
  const [rows, logins, counts, cookieStore, confirmedJobs] = await Promise.all([
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

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Admin</h1>
      {syncNotice.topError ? <p className="mb-6 text-sm text-[#a1a1a1]">{syncNotice.topError}</p> : null}
      {removed ? (
        <p className="mb-6 text-sm text-white">
          Removed {removed} and every teammate login, shoot, and photo on that record.
        </p>
      ) : null}
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
          <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:gap-4">
            <form action="/admin/clients" method="get" className="min-w-0 w-full lg:flex-1">
              <label htmlFor="client-search" className="sr-only">
                Find a client or login
              </label>
              <input
                id="client-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Find a client or login"
                autoComplete="off"
                className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
              />
            </form>
            <ClientSortSelect value={sort} />
          </div>
        {rows.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No clients yet.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No clients match.</p>
        ) : (
          <>
            <ul className="lg:hidden">
              {visible.map((client) => (
                <li key={client.id} className="border-b border-white/10">
                  <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px]">
                        {client.inviteCode} · {client.displayName}
                      </p>
                      <p className="truncate text-sm text-[#8e8e93]">
                        {client.company ? `${client.company} · ` : ""}
                        {client.primaryEmail}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-[#8e8e93]" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden lg:block">
              <div className="grid grid-cols-[7rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-4 border-b border-white/10 pb-2 text-xs uppercase tracking-[0.14em] text-[#8e8e93]">
                <span>Code</span>
                <span>Name</span>
                <span>Company</span>
                <span>Email</span>
                <span />
              </div>
              <ul>
                {visible.map((client) => (
                  <li key={client.id} className="border-b border-white/10">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="grid grid-cols-[7rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-4 py-4 hover:bg-white/5"
                    >
                      <p className="font-mono text-sm text-[#c7c7cc]">{client.inviteCode}</p>
                      <p className="truncate text-[15px]">{client.displayName}</p>
                      <p className="truncate text-sm text-[#8e8e93]">{client.company ?? "—"}</p>
                      <p className="truncate text-sm text-[#8e8e93]">{client.primaryEmail}</p>
                      <ChevronRight className="size-5 justify-self-end text-[#8e8e93]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        </AdminSection>
      </div>
    </PhoneShell>
  );
}
