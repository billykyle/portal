import { desc } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  } = await searchParams;
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));

  return (
    <PhoneShell wide>
      <header className="flex items-center justify-between py-6">
        <h1 className="text-2xl font-medium">Clients</h1>
        <SignOutButton admin />
      </header>
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      <section className="mb-10">
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
            {warnings && warnings !== "0" ? ` · ${warnings} skipped folder${warnings === "1" ? "" : "s"}` : ""}.
          </p>
        ) : null}
      </section>
      <section className="mb-10">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Mint client</h2>
        <MintClientForm minted={minted} />
      </section>
      <section className="pb-16">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">All clients</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No clients yet.</p>
        ) : (
          <ul>
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
        )}
      </section>
    </PhoneShell>
  );
}
