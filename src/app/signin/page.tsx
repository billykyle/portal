import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AuthHeader } from "@/components/auth-header";
import { SigninForm } from "@/components/forms/signin-form";
import { FormColumn, pageTitleClass, PhoneShell } from "@/components/phone-shell";
import { getInviteCookie, getSession } from "@/lib/auth";
import { CLIENT_HOME } from "@/lib/routes";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";

export default async function SigninPage() {
  if (await getSession()) {
    redirect(CLIENT_HOME);
  }
  const inviteCode = await getInviteCookie();
  let clientName: string | null = null;
  if (inviteCode) {
    await ensureDb();
    const [client] = await db.select().from(clients).where(eq(clients.inviteCode, inviteCode)).limit(1);
    clientName = client?.displayName ?? null;
  }

  return (
    <PhoneShell>
      {inviteCode ? (
        <AuthHeader clientName={clientName} />
      ) : (
        <AppHeader
          left={
            <Link href="/" className="text-sm text-[#8e8e93]">
              Back
            </Link>
          }
        />
      )}
      <FormColumn center className="pb-16">
        <h1 className={`${pageTitleClass} mb-6`}>Sign in</h1>
        <SigninForm />
      </FormColumn>
    </PhoneShell>
  );
}
