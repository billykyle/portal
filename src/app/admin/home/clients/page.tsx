import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminClientDirectory } from "@/components/admin-client-directory";
import { AdminHeader } from "@/components/admin-header";
import { pageStackClass, PhoneShell } from "@/components/phone-shell";
import { shootCountsByClient } from "@/lib/admin/clients";
import { CLIENT_SORT_COOKIE, parseClientSort, sortClients } from "@/lib/admin/client-sort";
import { signedUpMemberCount } from "@/lib/admin/member-count";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { ADMIN_HOME_CLIENTS } from "@/lib/routes";
import { directoryLogins } from "@/lib/user-portals";

export const metadata: Metadata = {
  title: "All clients",
};

export default async function AdminHomeClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const needle = query.toLowerCase();
  const [rows, logins, shootCounts, cookieStore] = await Promise.all([
    db.select().from(clients).orderBy(desc(clients.createdAt)),
    directoryLogins(),
    shootCountsByClient(),
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
      shootCount: shootCounts.get(client.id) ?? 0,
      memberCount: signedUpMemberCount(loginsByClient.get(client.id)),
    })),
    sort,
  );

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">All clients</h1>
      <div className={pageStackClass}>
        <AdminClientDirectory
          rowsEmpty={rows.length === 0}
          visible={visible}
          query={query}
          sort={sort}
          searchAction={ADMIN_HOME_CLIENTS}
        />
      </div>
    </PhoneShell>
  );
}
