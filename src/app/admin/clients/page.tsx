import { desc } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { ClientSortSelect } from "@/components/client-sort-select";
import { MintClientForm } from "@/components/forms/mint-client-form";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { pageTitleClass, PhoneShell } from "@/components/phone-shell";
import { clientCounts } from "@/lib/admin/clients";
import { CLIENT_SORT_COOKIE, parseClientSort, sortClients } from "@/lib/admin/client-sort";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users } from "@/lib/db/schema";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
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
  const [rows, logins, counts, cookieStore] = await Promise.all([
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
  ]);
  const sort = parseClientSort(cookieStore.get(CLIENT_SORT_COOKIE)?.value);
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
      <div className="mb-8 lg:mb-10">
        <h1 className={pageTitleClass}>Admin</h1>
      </div>
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      {removed ? (
        <p className="mb-6 text-sm text-white">
          Removed {removed} and every teammate login, shoot, and photo on that record.
        </p>
      ) : null}
      <div className="mb-10 grid gap-10 lg:grid-cols-2 lg:gap-12">
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">NAS sync</h2>
          <SyncNasForm />
          {synced ? (
            <p className="mt-3 text-sm text-white">
              Sync finished. {createdClients ?? "0"} new client{createdClients === "1" ? "" : "s"},{" "}
              {shoots ?? "0"} new shoot{shoots === "1" ? "" : "s"}, {photos ?? "0"} new photo
              {photos === "1" ? "" : "s"}. Reused {reusedClients ?? "0"} client
              {reusedClients === "1" ? "" : "s"} / {reusedShoots ?? "0"} shoot
              {reusedShoots === "1" ? "" : "s"}
              {refreshed && refreshed !== "0" ? `, refreshed ${refreshed} stills` : ""}
              {ready && ready !== "0" ? ` · ${ready} shoot${ready === "1" ? "" : "s"} ready to deliver` : ""}
              {removedPhotos && removedPhotos !== "0"
                ? ` · removed ${removedPhotos} file${removedPhotos === "1" ? "" : "s"} gone from NAS`
                : ""}
              {removedShoots && removedShoots !== "0"
                ? ` · removed ${removedShoots} portal-only shoot${removedShoots === "1" ? "" : "s"}`
                : ""}
              {warnings && warnings !== "0" ? ` · ${warnings} skipped folder${warnings === "1" ? "" : "s"}` : ""}.
            </p>
          ) : null}
          {emailSkipped ? <p className="mt-3 text-sm text-white">{emailSkipped}</p> : null}
        </section>
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Mint client</h2>
          <MintClientForm minted={minted} />
        </section>
      </div>
      <section className="pb-16">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">All clients</h2>
          <ClientSortSelect value={sort} />
        </div>
        <form action="/admin/clients" method="get" className="mb-4 lg:max-w-md">
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
        <p className="mb-4 text-sm leading-6 text-[#8e8e93]">
          Open a client, then Edit profile on a login to change the name, company, phone, and
          sign-in email from Account.
        </p>
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
                      className="grid grid-cols-[7rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-4 py-3.5 hover:bg-white/5"
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
      </section>
    </PhoneShell>
  );
}
