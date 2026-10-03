import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { AdminUserProfileForm } from "@/components/forms/admin-user-profile-form";
import { ExtraBkCodes } from "@/components/forms/extra-bk-codes";
import { formMeasureClass, pageHeadingWrapClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users } from "@/lib/db/schema";
import { teammateDisplayName } from "@/lib/signup-fields";
import { listPortalsForUser, userBelongsToClient } from "@/lib/user-portals";

export const metadata: Metadata = {
  title: "Edit profile",
};

export default async function AdminUserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; userId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; added?: string; removedCode?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id, userId } = await params;
  const { error, saved, added, removedCode } = await searchParams;
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) {
    notFound();
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await userBelongsToClient(user.id, client.id))) {
    notFound();
  }
  const portals = await listPortalsForUser(user.id);
  const signup = portals.find((portal) => portal.id === user.clientId);
  const extras = portals.filter((portal) => portal.id !== user.clientId);

  return (
    <PhoneShell>
      <AdminHeader />
      <header className={pageHeadingWrapClass}>
        <p className="text-sm text-[#8e8e93]">{client.inviteCode}</p>
        <h1 className="text-2xl font-medium">{teammateDisplayName(user)}</h1>
        {error ? <p className="mt-3 text-sm text-[#a1a1a1]">{error}</p> : null}
        {saved ? <p className="mt-3 text-sm text-white">Profile saved.</p> : null}
        {added ? <p className="mt-3 text-sm text-white">Added {added}. This login can open that client.</p> : null}
        {removedCode ? <p className="mt-3 text-sm text-white">Removed that code from this login.</p> : null}
      </header>
      <div className={`${formMeasureClass} ${pageStackClass}`}>
        <AdminUserProfileForm
          clientId={client.id}
          userId={user.id}
          firstName={user.firstName ?? ""}
          lastName={user.lastName ?? ""}
          companyName={client.company ?? ""}
          phone={user.phone ?? ""}
          email={user.email}
        />
        <ExtraBkCodes
          clientId={client.id}
          userId={user.id}
          signupCode={signup?.inviteCode ?? client.inviteCode}
          extras={extras.map((portal) => ({
            id: portal.id,
            inviteCode: portal.inviteCode,
            displayName: portal.displayName,
          }))}
        />
      </div>
    </PhoneShell>
  );
}
