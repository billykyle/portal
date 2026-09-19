import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BkMark } from "@/components/logo";
import { AttachShootForm } from "@/components/forms/attach-shoot-form";
import { DeleteClientForm } from "@/components/forms/delete-client-form";
import { EditClientForm } from "@/components/forms/edit-client-form";
import { RemoveUserForm } from "@/components/forms/remove-user-form";
import { PhoneShell } from "@/components/phone-shell";
import { BookingList } from "@/components/booking-list";
import { ShootList } from "@/components/shoot-list";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots, users } from "@/lib/db/schema";
import { formatShootDate } from "@/lib/media";
import { listClientBookingsAdmin } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";

export default async function AdminClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    attached?: string;
    delivered?: string;
    saved?: string;
    userRemoved?: string;
    shootRemoved?: string;
    bookingCancelled?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id } = await params;
  const { error, attached, delivered, saved, userRemoved, shootRemoved, bookingCancelled } =
    await searchParams;
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) {
    notFound();
  }
  const teammateRows = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.clientId, client.id))
    .orderBy(desc(users.createdAt));
  const shootRows = await db
    .select()
    .from(shoots)
    .where(eq(shoots.clientId, client.id))
    .orderBy(desc(shoots.shotDate));
  const mediaRows = await db.select().from(media);
  const bookingRows = await listClientBookingsAdmin(client.id);
  const hours = schedulingHours();

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
        {error ? <p className="mt-3 text-sm text-[#a1a1a1]">{error}</p> : null}
        {saved ? <p className="mt-3 text-sm text-white">Client saved.</p> : null}
        {userRemoved ? (
          <p className="mt-3 text-sm text-white">Removed {userRemoved}. The invite is unchanged.</p>
        ) : null}
        {delivered ? (
          <p className="mt-3 text-sm text-white">Marked delivered. No email was sent — Pepper can hook this later.</p>
        ) : null}
        {attached ? <p className="mt-3 text-sm text-white">Shoot attached from NAS.</p> : null}
        {shootRemoved ? <p className="mt-3 text-sm text-white">Shoot deleted. The client invite is unchanged.</p> : null}
        {bookingCancelled ? <p className="mt-3 text-sm text-white">Booking cancelled.</p> : null}
      </header>
      <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-12 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div>
          <section className="mb-10">
            <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Client info</h2>
            <EditClientForm client={client} />
          </section>
          <section className="mb-10">
            <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Teammate logins</h2>
            <p className="mb-4 text-sm leading-6 text-[#8e8e93]">
              These are email/password accounts that redeemed {client.inviteCode}. Removing one
              login does not delete the client or the invite. They can sign up again with the
              same code.
            </p>
            {teammateRows.length === 0 ? (
              <p className="text-sm text-[#8e8e93]">No one has redeemed this invite yet.</p>
            ) : (
              <ul>
                {teammateRows.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 border-b border-white/10 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">{user.email}</p>
                      <p className="text-xs text-[#8e8e93]">
                        Joined{" "}
                        {user.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <RemoveUserForm clientId={client.id} userId={user.id} email={user.email} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mb-10">
            <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Attach shoot</h2>
            <AttachShootForm clientId={client.id} />
          </section>
        </div>
        <section className="mb-10">
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Bookings</h2>
          <BookingList
            bookings={bookingRows.map((booking) => ({ ...booking, clientId: client.id }))}
            emptyLabel="No bookings yet."
            timeZone={hours.timeZone}
            allowCancel
            admin
          />
        </section>
        <section className="mb-10">
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Shoots</h2>
          <ShootList
            variant="admin"
            emptyLabel="No shoots attached yet."
            shoots={shootRows.map((shoot) => {
              const count = mediaRows.filter((item) => item.shootId === shoot.id).length;
              return {
                id: shoot.id,
                href: `/shoots/${shoot.id}`,
                address: shoot.address,
                shotDate: shoot.shotDate,
                dateLabel: formatShootDate(shoot.shotDate),
                clientId: client.id,
                fileCount: count,
                publicToken: shoot.publicToken,
              };
            })}
          />
        </section>
      </div>
      <section className="pb-16 md:max-w-md">
        <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Delete client</h2>
        <DeleteClientForm clientId={client.id} inviteCode={client.inviteCode} />
      </section>
    </PhoneShell>
  );
}
