import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth-header";
import { SigninForm } from "@/components/forms/signin-form";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { getInviteCookie, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";

export default async function SigninPage() {
  if (await getSession()) {
    redirect("/library");
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
        <div className="flex items-center justify-between py-6">
          <Link href="/" className="text-sm text-[#8e8e93]">
            Back
          </Link>
          <BkMark size="header" />
          <span className="w-10" />
        </div>
      )}
      <h1 className="mb-6 text-2xl font-medium">Sign in</h1>
      <SigninForm />
    </PhoneShell>
  );
}
