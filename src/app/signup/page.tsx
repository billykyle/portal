import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth-header";
import { SignupForm } from "@/components/forms/signup-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { getInviteCookie, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";

export default async function SignupPage() {
  if (await getSession()) {
    redirect("/library");
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
      <h1 className="mb-6 text-2xl font-medium">Create account</h1>
      <FormColumn>
        <SignupForm inviteCode={inviteCode} />
      </FormColumn>
    </PhoneShell>
  );
}
