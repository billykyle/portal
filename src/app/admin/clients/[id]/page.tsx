import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { DeleteClientForm } from "@/components/forms/delete-client-form";
import { EditClientForm } from "@/components/forms/edit-client-form";
import { RemoveUserForm } from "@/components/forms/remove-user-form";
import { PhoneShell } from "@/components/phone-shell";
import { BookingList } from "@/components/booking-list";
import { ShootList } from "@/components/shoot-list";
import {
  ADMIN_SECTIONS_COOKIE,
  clientDetailSectionForce,
  parseOpenSections,
  sectionStartsOpen,
} from "@/lib/admin/sections";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots, users } from "@/lib/db/schema";
import { formatShootDate } from "@/lib/media";
import { listClientBookingsAdmin } from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";
import { teammateDisplayName } from "@/lib/signup-fields";

export default async function AdminClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    userRemoved?: string;
    bookingCancelled?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id } = await params;
  const { error, saved, userRemoved, bookingCancelled } = await searchParams;
  const openSections = parseOpenSections((await cookies()).get(ADMIN_SECTIONS_COOKIE)?.value);
  const detailSignals = {
    saved: Boolean(saved),
    userRemoved: Boolean(userRemoved),
    bookingCancelled: Boolean(bookingCancelled),
    error: error ?? "",
  };
  function detailOpen(id: string) {
    return sectionStartsOpen(openSections, id, clientDetailSectionForce(id, detailSignals));
  }
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) {
    notFound();
  }
  const teammateRows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
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
      <AdminHeader backHref="/admin/clients" backLabel="Clients" />
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
        {bookingCancelled ? <p className="mt-3 text-sm text-white">Booking cancelled.</p> : null}
      </header>
      <div className="pb-8">
        <AdminSection id="client:info" label="Client info" defaultOpen={detailOpen("client:info")}>
          <div className="max-w-md">
            <EditClientForm client={client} />
          </div>
        </AdminSection>
        <AdminSection id="client:logins" label="Teammate logins" defaultOpen={detailOpen("client:logins")}>
            {teammateRows.length === 0 ? (
              <p className="text-sm text-[#8e8e93]">No one has redeemed this invite yet.</p>
            ) : (
              <ul>
                {teammateRows.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 border-b border-white/10 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">{teammateDisplayName(user)}</p>
                      <p className="truncate text-sm text-[#8e8e93]">{user.email}</p>
                      {user.phone ? <p className="truncate text-sm text-[#8e8e93]">{user.phone}</p> : null}
                      <p className="text-xs text-[#8e8e93]">
                        Joined{" "}
                        {user.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Link
                        href={`/admin/clients/${client.id}/users/${user.id}`}
                        className="text-sm text-white underline decoration-white/20 underline-offset-4"
                      >
                        Edit profile
                      </Link>
                      <RemoveUserForm clientId={client.id} userId={user.id} email={user.email} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </AdminSection>
        <AdminSection id="client:bookings" label="Bookings" defaultOpen={detailOpen("client:bookings")}>
          <BookingList
            bookings={bookingRows.map((booking) => ({ ...booking, clientId: client.id }))}
            emptyLabel="No bookings yet."
            timeZone={hours.timeZone}
            allowCancel
            allowModify
            admin
          />
        </AdminSection>
        <AdminSection id="client:shoots" label="Shoots" defaultOpen={detailOpen("client:shoots")}>
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
                fileCount: count,
                publicToken: shoot.publicToken,
              };
            })}
          />
        </AdminSection>
        <AdminSection id="client:delete" label="Delete client" defaultOpen={detailOpen("client:delete")}>
          <div className="max-w-md">
            <DeleteClientForm clientId={client.id} inviteCode={client.inviteCode} />
          </div>
        </AdminSection>
      </div>
    </PhoneShell>
  );
}
