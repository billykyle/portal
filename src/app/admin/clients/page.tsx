import { desc } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BkMark } from "@/components/logo";
import { MintClientForm } from "@/components/forms/mint-client-form";
import { SyncNasForm } from "@/components/forms/sync-nas-form";
import { PhoneShell } from "@/components/phone-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";

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
    ready?: string;
    removed?: string;
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
    minted,
    synced,
    clients: createdClients,
    shoots,
    photos,
    refreshed,
    reusedClients,
    reusedShoots,
    warnings,
    ready,
    removed,
    removedShoots,
    removedPhotos,
  } = await searchParams;
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));

  return (
    <PhoneShell wide>
      <header className="flex items-center justify-between gap-4 py-6">
        <div className="flex min-w-0 items-center gap-3">
          <BkMark size="header" className="shrink-0" />
          <h1 className="text-2xl font-medium">Admin</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/bookings" className="text-sm text-[#8e8e93]">
            Bookings
          </Link>
          <SignOutButton admin />
        </div>
      </header>
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
        </section>
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Mint client</h2>
          <MintClientForm minted={minted} />
        </section>
      </div>
      <section className="pb-16">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">All clients</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No clients yet.</p>
        ) : (
          <>
            <ul className="lg:hidden">
              {rows.map((client) => (
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
                {rows.map((client) => (
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
