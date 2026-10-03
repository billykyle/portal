import { redirect } from "next/navigation";
import { PortalChooser } from "@/components/portal-chooser";
import { SplashScreen } from "@/components/splash-screen";
import { clearPortalChoice, createSession, getPortalChoice, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { users } from "@/lib/db/schema";
import { CLIENT_HOME } from "@/lib/routes";
import { listPortalsForUser } from "@/lib/user-portals";
import { eq } from "drizzle-orm";

export default async function ChoosePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) {
    redirect(CLIENT_HOME);
  }
  const choice = await getPortalChoice();
  if (!choice) {
    redirect("/signin");
  }
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, choice.userId)).limit(1);
  const portals = user ? await listPortalsForUser(user.id) : [];
  if (!user || portals.length === 0) {
    await clearPortalChoice();
    redirect("/signin");
  }
  if (portals.length === 1) {
    await createSession({
      userId: user.id,
      email: user.email,
      clientId: portals[0].id,
      inviteCode: portals[0].inviteCode,
    });
    await clearPortalChoice();
    redirect(CLIENT_HOME);
  }
  const { error } = await searchParams;

  return (
    <SplashScreen subtitle="Client Portal">
      {error ? <p className="mb-4 text-sm text-[#a1a1a1]">{error}</p> : null}
      <PortalChooser portals={portals} />
    </SplashScreen>
  );
}
