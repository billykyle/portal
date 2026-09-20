import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClientHeader } from "@/components/client-header";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
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
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Account</h1>
      </div>
      <div className="grid gap-12 pb-16 md:max-w-md">
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Edit profile</h2>
          <FormColumn>
            <AccountProfileForm
              firstName={user.firstName ?? ""}
              lastName={user.lastName ?? ""}
              companyName={client?.company ?? ""}
              phone={user.phone ?? ""}
              email={user.email}
            />
          </FormColumn>
        </section>
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Change password</h2>
          <FormColumn>
            <ChangePasswordForm />
          </FormColumn>
        </section>
        <section>
          <h2 className="mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Sign out</h2>
          <SignOutButton />
        </section>
      </div>
    </PhoneShell>
  );
}
