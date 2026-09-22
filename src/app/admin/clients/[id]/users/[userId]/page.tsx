import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AdminUserProfileForm } from "@/components/forms/admin-user-profile-form";
import { PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users } from "@/lib/db/schema";
import { teammateDisplayName } from "@/lib/signup-fields";

export default async function AdminUserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; userId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id, userId } = await params;
  const { error, saved } = await searchParams;
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) {
    notFound();
  }
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.clientId, client.id)))
    .limit(1);
  if (!user) {
    notFound();
  }

  return (
    <PhoneShell>
      <AppHeader
        left={
          <Link href={`/admin/clients/${client.id}`} className="text-sm text-[#8e8e93]">
            {client.displayName}
          </Link>
        }
      />
      <header className="mb-8">
        <p className="text-sm text-[#8e8e93]">{client.inviteCode}</p>
        <h1 className="text-2xl font-medium">Edit profile</h1>
        <p className="mt-2 text-sm text-[#c7c7cc]">{teammateDisplayName(user)}</p>
        {error ? <p className="mt-3 text-sm text-[#a1a1a1]">{error}</p> : null}
        {saved ? <p className="mt-3 text-sm text-white">Profile saved.</p> : null}
      </header>
      <div className="pb-16 md:max-w-md">
        <AdminUserProfileForm
          clientId={client.id}
          userId={user.id}
          firstName={user.firstName ?? ""}
          lastName={user.lastName ?? ""}
          companyName={client.company ?? ""}
          phone={user.phone ?? ""}
          email={user.email}
        />
      </div>
    </PhoneShell>
  );
}
