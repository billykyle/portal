import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { ShootList } from "@/components/shoot-list";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, shoots } from "@/lib/db/schema";
import { formatShootDate } from "@/lib/media";

export const metadata: Metadata = {
  title: "My Content",
};

export default async function LibraryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);
  const rows = await db
    .select()
    .from(shoots)
    .where(eq(shoots.clientId, session.clientId))
    .orderBy(desc(shoots.shotDate), desc(shoots.createdAt));

  return (
    <PhoneShell>
      <ClientHeader />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">
          {client?.displayName ?? "Your shoots"}
        </h1>
        {client?.primaryEmail ? (
          <p className="mt-1 text-sm text-[#8e8e93]">{client.primaryEmail}</p>
        ) : null}
        {client?.company ? <p className="text-sm text-[#8e8e93]">{client.company}</p> : null}
      </div>
      <ShootList
        emptyLabel="No shoots yet. Your photographer will post them here."
        shoots={rows.map((shoot) => ({
          id: shoot.id,
          href: `/shoots/${shoot.id}`,
          address: shoot.address,
          shotDate: shoot.shotDate,
          dateLabel: formatShootDate(shoot.shotDate),
        }))}
      />
    </PhoneShell>
  );
}
