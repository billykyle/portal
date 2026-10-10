import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { DisconnectAgentButton } from "@/components/forms/agent-access-forms";
import { ClientHeader } from "@/components/client-header";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { desktopSplitClass, PhoneShell, sectionLabelClass } from "@/components/phone-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { clearSession, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users } from "@/lib/db/schema";
import { userBelongsToClient } from "@/lib/user-portals";
import { listConnectedAgents } from "@/lib/client-agent/connections";
import { schedulingHours } from "@/lib/scheduling/config";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ disconnected?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  const { disconnected } = await searchParams;
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || !(await userBelongsToClient(user.id, session.clientId))) {
    await clearSession();
    redirect("/");
  }
  const [client, connections] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1),
    listConnectedAgents(session.clientId),
  ]);
  const clientRow = client[0];
  const hours = schedulingHours();

  return (
    <PhoneShell>
      <ClientHeader />
      <h1 className="sr-only">Account</h1>
      <div className={desktopSplitClass}>
        <div className="grid min-w-0 content-start gap-10">
          <section>
            <h2 className={sectionLabelClass}>Edit profile</h2>
            <AccountProfileForm
              firstName={user.firstName ?? ""}
              lastName={user.lastName ?? ""}
              companyName={clientRow?.company ?? ""}
              phone={user.phone ?? ""}
              email={user.email}
            />
          </section>
          <section>
            <h2 className={sectionLabelClass}>Sign out</h2>
            <SignOutButton />
          </section>
        </div>
        <section className="min-w-0">
          <h2 className={sectionLabelClass}>Change password</h2>
          <ChangePasswordForm />
        </section>
      </div>
      <section className="mt-4 pb-16">
        <h2 className={sectionLabelClass}>Connected agents</h2>
        {disconnected ? <p className="mb-4 text-sm text-white">Agent disconnected.</p> : null}
        {connections.length === 0 ? (
          <p className="text-sm text-[#8e8e93]">No agents are connected to this BK code.</p>
        ) : (
          <ul>
            {connections.map((connection) => (
              <li key={connection.tokenId} className="flex items-center gap-3 border-b border-white/10 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{connection.agentName}</p>
                  <p className="truncate text-sm text-[#8e8e93]">Approved by {connection.userEmail}</p>
                  <p className="text-xs text-[#8e8e93]">
                    Connected{" "}
                    {connection.connectedAt.toLocaleString("en-US", {
                      timeZone: hours.timeZone,
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-xs text-[#8e8e93]">
                    Last used{" "}
                    {connection.lastUsedAt
                      ? connection.lastUsedAt.toLocaleString("en-US", {
                          timeZone: hours.timeZone,
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "not yet"}
                  </p>
                </div>
                <DisconnectAgentButton tokenId={connection.tokenId} agentName={connection.agentName} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PhoneShell>
  );
}
