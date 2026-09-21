import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth-header";
import { SignupForm } from "@/components/forms/signup-form";
import { FormColumn, pageTitleClass, PhoneShell } from "@/components/phone-shell";
import { getInviteCookie, getSession } from "@/lib/auth";
import { CLIENT_HOME } from "@/lib/routes";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { isPendingClientEmail } from "@/lib/signup-fields";

export default async function SignupPage() {
  if (await getSession()) {
    redirect(CLIENT_HOME);
  }
  const inviteCode = await getInviteCookie();
  if (!inviteCode) {
    redirect("/");
  }
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.inviteCode, inviteCode)).limit(1);

  return (
    <PhoneShell>
      <AuthHeader clientName={client?.displayName} />
      <FormColumn center className="pb-16">
        <h1 className={`${pageTitleClass} mb-6`}>Create account</h1>
        <SignupForm
          inviteCode={inviteCode}
          defaultEmail={
            client?.primaryEmail && !isPendingClientEmail(client.primaryEmail)
              ? client.primaryEmail
              : undefined
          }
          defaultCompany={client?.company ?? undefined}
        />
      </FormColumn>
    </PhoneShell>
  );
}
