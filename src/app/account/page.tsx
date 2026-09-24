import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClientHeader } from "@/components/client-header";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { PhoneShell, sectionLabelClass } from "@/components/phone-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.clientId !== session.clientId) {
    redirect("/");
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);

  return (
    <PhoneShell>
      <ClientHeader />
      <h1 className="sr-only">Account</h1>
      <div className="grid gap-12 pb-16 md:max-w-md lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-x-16">
        <div className="grid min-w-0 content-start gap-12">
          <section>
            <h2 className={sectionLabelClass}>Edit profile</h2>
            <AccountProfileForm
              firstName={user.firstName ?? ""}
              lastName={user.lastName ?? ""}
              companyName={client?.company ?? ""}
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
    </PhoneShell>
  );
}
