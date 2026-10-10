"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import { getAdminSession } from "@/lib/admin-auth";
import { listConnectedAgents, revokeOneAgentToken, revokePortalAgentTokens } from "@/lib/client-agent/connections";
import { safeOauthReturn } from "@/lib/client-agent/protocol";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { CLIENT_ACCOUNT } from "@/lib/routes";
import { userBelongsToClient } from "@/lib/user-portals";

export async function setClientAgentAccess(formData: FormData) {
  if (!(await getAdminSession())) redirect("/admin");
  await ensureDb();
  const clientId = String(formData.get("clientId") ?? "");
  const enabled = formData.get("enabled") === "1";
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) redirect("/admin/clients");
  await db.update(clients).set({ agentAccess: enabled }).where(eq(clients.id, clientId));
  if (!enabled) await revokePortalAgentTokens(clientId);
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}?agentSaved=1`);
}

export async function revokeClientAgentConnection(formData: FormData) {
  if (!(await getAdminSession())) redirect("/admin");
  const clientId = String(formData.get("clientId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  await revokeOneAgentToken(clientId, tokenId);
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}?agentRevoked=1`);
}

export async function disconnectMyAgent(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!(await userBelongsToClient(session.userId, session.clientId))) {
    await clearSession();
    redirect("/");
  }
  const tokenId = String(formData.get("tokenId") ?? "");
  const mine = await listConnectedAgents(session.clientId);
  if (mine.some((row) => row.tokenId === tokenId)) {
    await revokeOneAgentToken(session.clientId, tokenId);
  }
  revalidatePath(CLIENT_ACCOUNT);
  redirect(`${CLIENT_ACCOUNT}?disconnected=1`);
}

export async function signOutForOauth(formData: FormData) {
  const returnTo = safeOauthReturn(String(formData.get("returnTo") ?? ""));
  await clearSession();
  redirect(returnTo ?? "/signin");
}
