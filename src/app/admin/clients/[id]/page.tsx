import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BkMark } from "@/components/logo";
import { CopyPublicLink } from "@/components/copy-public-link";
import { AttachShootForm } from "@/components/forms/attach-shoot-form";
import { MarkDeliveredForm } from "@/components/forms/mark-delivered-form";
import { PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots } from "@/lib/db/schema";
import { formatShootDate } from "@/lib/media";
import { publicShootUrl } from "@/lib/public-link";

export default async function AdminClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; attached?: string; delivered?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id } = await params;
  const { error, attached, delivered } = await searchParams;
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) {
    notFound();
  }
  const shootRows = await db
    .select()
    .from(shoots)
    .where(eq(shoots.clientId, client.id))
    .orderBy(desc(shoots.shotDate));
  const mediaRows = await db.select().from(media);

  return (
    <PhoneShell wide>
      <div className="flex items-center justify-between py-6">
        <Link href="/admin/clients" className="text-sm text-[#8e8e93]">
          Clients
        </Link>
        <BkMark size="header" />
      </div>
      <header className="mb-8">
        <p className="text-sm text-[#8e8e93]">{client.inviteCode}</p>
        <h1 className="text-2xl font-medium">{client.displayName}</h1>
        <p className="mt-2 text-sm text-[#c7c7cc]">{client.primaryEmail}</p>
        {client.company ? <p className="text-sm text-[#8e8e93]">{client.company}</p> : null}
        {client.notes ? <p className="mt-3 text-sm text-[#8e8e93]">{client.notes}</p> : null}
        {delivered ? (
          <p className="mt-3 text-sm text-white">Marked delivered. No email was sent — Pepper can hook this later.</p>
        ) : null}
      </header>
      <section className="mb-10">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Attach shoot</h2>
        <AttachShootForm clientId={client.id} error={error} attached={attached === "1"} />
      </section>
      <section className="pb-16">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Shoots</h2>
        {shootRows.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No shoots attached yet.</p>
        ) : (
          <ul>
            {shootRows.map((shoot) => {
              const count = mediaRows.filter((item) => item.shootId === shoot.id).length;
              return (
                <li key={shoot.id} className="border-b border-white/10 py-4">
                  <p className="text-[15px]">{formatShootDate(shoot.shotDate)}</p>
                  <p className="text-sm text-[#8e8e93]">{shoot.address}</p>
                  <p className="mt-1 text-xs text-[#8e8e93]">
                    {count} file{count === 1 ? "" : "s"}
                    {shoot.dropboxUrl ? " · Dropbox backup" : ""}
                    {shoot.deliveredAt
                      ? ` · Delivered ${shoot.deliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : " · Not delivered"}
                  </p>
                  <p className="mt-1 break-all text-xs text-[#8e8e93]">{publicShootUrl(shoot.publicToken)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <CopyPublicLink token={shoot.publicToken} compact />
                    {!shoot.deliveredAt ? (
                      <MarkDeliveredForm clientId={client.id} shootId={shoot.id} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PhoneShell>
  );
}
