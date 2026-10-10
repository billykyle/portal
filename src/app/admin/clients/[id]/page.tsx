import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgentAccessToggle, RevokeAgentButton } from "@/components/forms/agent-access-forms";
import { AdminHeader } from "@/components/admin-header";
import { AdminSection } from "@/components/admin-section";
import { DeleteClientForm } from "@/components/forms/delete-client-form";
import { EditClientForm } from "@/components/forms/edit-client-form";
import { RemoveUserForm } from "@/components/forms/remove-user-form";
import { formMeasureClass, pageHeadingWrapClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { BookingList, QueuedBookingList } from "@/components/booking-list";
import { contentTemplate } from "@/components/templates/registry";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots } from "@/lib/db/schema";
import { listClientMembers } from "@/lib/user-portals";
import { coverUrlByShoot } from "@/lib/episode-covers";
import { formatShootDate, shootFolderName } from "@/lib/media";
import { publicShootUrl } from "@/lib/public-link";
import { adminShootPath } from "@/lib/shoot-slug";
import { listClientBookingsAdmin } from "@/lib/scheduling/bookings";
import { adminBookingHref } from "@/lib/scheduling/urls";
import { schedulingHours } from "@/lib/scheduling/config";
import { teammateDisplayName } from "@/lib/signup-fields";
import { listAgentActivity, listConnectedAgents } from "@/lib/client-agent/connections";

function formatAgentWhen(date: Date, timeZone: string) {
  return date.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    userRemoved?: string;
    detached?: string;
    bookingCancelled?: string;
    agentSaved?: string;
    agentRevoked?: string;
  }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id } = await params;
  const { error, saved, userRemoved, detached, bookingCancelled, agentSaved, agentRevoked } = await searchParams;
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) {
    notFound();
  }
  const [teammateRows, shootRows, bookingRows, connections, activity] = await Promise.all([
    listClientMembers(client.id),
    db.select().from(shoots).where(eq(shoots.clientId, client.id)).orderBy(desc(shoots.shotDate)),
    listClientBookingsAdmin(client.id),
    listConnectedAgents(client.id),
    listAgentActivity(client.id),
  ]);
  const mediaRows =
    shootRows.length === 0
      ? []
      : await db
          .select()
          .from(media)
          .where(
            inArray(
              media.shootId,
              shootRows.map((shoot) => shoot.id),
            ),
          );
  const hours = schedulingHours();
  const covers = client.category === "podcast" ? coverUrlByShoot(mediaRows) : new Map<string, string | null>();
  const AdminShoots = contentTemplate(client.category).AdminShoots;

  return (
    <PhoneShell wide>
      <AdminHeader />
      <header className={pageHeadingWrapClass}>
        <p className="text-sm text-[#8e8e93]">{client.inviteCode}</p>
        <h1 className="text-2xl font-medium">{client.displayName}</h1>
        <p className="mt-2 text-sm text-[#c7c7cc]">{client.primaryEmail}</p>
        {client.company ? <p className="text-sm text-[#8e8e93]">{client.company}</p> : null}
        {error ? <p className="mt-3 text-sm text-[#a1a1a1]">{error}</p> : null}
        {saved ? <p className="mt-3 text-sm text-white">Client saved.</p> : null}
        {userRemoved ? (
          <p className="mt-3 text-sm text-white">
            {detached
              ? `Removed ${userRemoved} from this client. Their login still opens the client they signed up with.`
              : `Removed ${userRemoved}. The invite is unchanged.`}
          </p>
        ) : null}
        {bookingCancelled ? <p className="mt-3 text-sm text-white">Booking cancelled.</p> : null}
        {agentSaved ? <p className="mt-3 text-sm text-white">Agent access saved.</p> : null}
        {agentRevoked ? <p className="mt-3 text-sm text-white">Agent disconnected.</p> : null}
      </header>
      <div className={pageStackClass}>
        <AdminSection id="client:info" label="Client info" defaultOpen={false} remember={false}>
          <div className={formMeasureClass}>
            <EditClientForm client={client} />
          </div>
        </AdminSection>
        <AdminSection id="client:agents" label="Agent access" defaultOpen={false} remember={false}>
          <div className={formMeasureClass}>
            <AgentAccessToggle clientId={client.id} enabled={client.agentAccess} />
            <h3 className="mb-3 mt-8 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Connected agents</h3>
            {connections.length === 0 ? (
              <p className="text-sm text-[#8e8e93]">No agents are connected.</p>
            ) : (
              <ul>
                {connections.map((connection) => (
                  <li key={connection.tokenId} className="flex items-center gap-3 border-b border-white/10 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">{connection.agentName}</p>
                      <p className="truncate text-sm text-[#8e8e93]">Approved by {connection.userEmail}</p>
                      <p className="text-xs text-[#8e8e93]">Connected {formatAgentWhen(connection.connectedAt, hours.timeZone)}</p>
                      <p className="text-xs text-[#8e8e93]">
                        Last used{" "}
                        {connection.lastUsedAt ? formatAgentWhen(connection.lastUsedAt, hours.timeZone) : "not yet"}
                      </p>
                    </div>
                    <RevokeAgentButton clientId={client.id} tokenId={connection.tokenId} agentName={connection.agentName} />
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mb-3 mt-8 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Activity</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-[#8e8e93]">No tool calls yet.</p>
            ) : (
              <ul>
                {activity.map((call) => (
                  <li key={call.id} className="border-b border-white/10 py-3">
                    <p className="text-xs text-[#8e8e93]">
                      {formatAgentWhen(call.createdAt, hours.timeZone)} · {call.tool}
                    </p>
                    <p className="text-sm text-[#c7c7cc]">{call.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AdminSection>
        <AdminSection id="client:logins" label="Teammate logins" defaultOpen={false} remember={false}>
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
                      {user.clientId !== client.id && user.signupInviteCode ? (
                        <p className="text-xs text-[#8e8e93]">Signed up with {user.signupInviteCode}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Link
                        href={`/admin/clients/${client.id}/users/${user.id}`}
                        className="text-sm text-white underline decoration-white/20 underline-offset-4"
                      >
                        Edit profile
                      </Link>
                      <RemoveUserForm
                        clientId={client.id}
                        userId={user.id}
                        email={user.email}
                        detachOnly={user.clientId !== client.id}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </AdminSection>
        {bookingRows.some((booking) => booking.status === "queued") ? (
          <AdminSection id="client:queue" label="Queue" defaultOpen={false} remember={false}>
            <QueuedBookingList
              bookings={bookingRows
                .filter((booking) => booking.status === "queued")
                .map((booking) => ({ ...booking, clientId: client.id, clientName: client.displayName }))}
              scheduleHref={(booking) => adminBookingHref(booking.id)}
            />
          </AdminSection>
        ) : null}
        <AdminSection id="client:bookings" label="Bookings" defaultOpen={false} remember={false}>
          <BookingList
            bookings={bookingRows
              .filter((booking) => booking.status !== "queued")
              .map((booking) => ({ ...booking, clientId: client.id }))}
            emptyLabel="No bookings yet."
            timeZone={hours.timeZone}
            allowCancel
            allowModify
            admin
            columns={2}
          />
        </AdminSection>
        <AdminSection id="client:shoots" label="Shoots" defaultOpen={false} remember={false}>
          <AdminShoots
            shoots={shootRows.map((shoot) => {
              const files = mediaRows.filter((item) => item.shootId === shoot.id);
              return {
                id: shoot.id,
                href: adminShootPath(client.id, shoot.slug),
                address: shoot.address,
                shotDate: shoot.shotDate,
                dateLabel: formatShootDate(shoot.shotDate),
                folderName: shootFolderName(shoot.shotDate, shoot.address),
                thumbUrl: covers.get(shoot.id) ?? null,
                fileCount: files.length,
                publicUrl: publicShootUrl(client.publicSlug, shoot.publicSlug),
                categoryFolder: shoot.categoryFolder,
              };
            })}
          />
        </AdminSection>
        <AdminSection id="client:delete" label="Delete client" defaultOpen={false} remember={false}>
          <div className={formMeasureClass}>
            <DeleteClientForm clientId={client.id} inviteCode={client.inviteCode} />
          </div>
        </AdminSection>
      </div>
    </PhoneShell>
  );
}
