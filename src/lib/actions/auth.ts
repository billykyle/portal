"use server";

import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearInviteCookie,
  clearPortalChoice,
  clearSession,
  createPortalChoice,
  createSession,
  getInviteCookie,
  getPortalChoice,
  getSession,
  setInviteCookie,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, passwordResetTokens, users } from "@/lib/db/schema";
import { emailConfigured, sendEmail } from "@/lib/email";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";
import { CLIENT_ACCOUNT, CLIENT_HOME, CLIENT_LIBRARY, PORTAL_CHOOSER } from "@/lib/routes";
import { listPortalsForUser, signInDestination, userBelongsToClient } from "@/lib/user-portals";
import { recordInviteRedeemedContact } from "@/lib/client-contact";
import { safeOauthReturn } from "@/lib/client-agent/protocol";
import { parseAccountProfile, parsePasswordChange, parseSignupProfile } from "@/lib/signup-fields";

export type ActionState = {
  error?: string;
  resetUrl?: string;
  success?: string;
};

export async function redeemInvite(_prev: ActionState | undefined, formData: FormData) {
  await ensureDb();
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  if (!isInviteCode(code)) {
    return { error: "Invite codes look like BK00001." };
  }
  const [client] = await db.select().from(clients).where(eq(clients.inviteCode, code)).limit(1);
  if (!client) {
    return { error: "That invite code was not found." };
  }
  await setInviteCookie(code);
  redirect("/signup");
}

export async function signUp(_prev: ActionState | undefined, formData: FormData) {
  await ensureDb();
  const profile = parseSignupProfile({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const inviteCode = normalizeInviteCode(
    String(formData.get("inviteCode") ?? "") || (await getInviteCookie()) || "",
  );

  if (!profile.ok) {
    return { error: profile.error };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  if (!isInviteCode(inviteCode)) {
    return { error: "Enter an invite code first." };
  }

  const [client] = await db.select().from(clients).where(eq(clients.inviteCode, inviteCode)).limit(1);
  if (!client) {
    return { error: "That invite code was not found." };
  }
  const [existing] = await db.select().from(users).where(eq(users.email, profile.value.email)).limit(1);
  if (existing) {
    return { error: "That email already has an account. Sign in instead." };
  }

  const [user] = await db
    .insert(users)
    .values({
      email: profile.value.email,
      passwordHash: await hash(password, 10),
      firstName: profile.value.firstName,
      lastName: profile.value.lastName,
      phone: profile.value.phone,
      clientId: client.id,
    })
    .returning();

  await recordInviteRedeemedContact(client, {
    email: profile.value.email,
    companyName: profile.value.companyName,
  });

  await createSession({
    userId: user.id,
    email: user.email,
    clientId: client.id,
    inviteCode: client.inviteCode,
  });
  await clearInviteCookie();
  redirect(CLIENT_HOME);
}

export async function signIn(_prev: ActionState | undefined, formData: FormData) {
  await ensureDb();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const returnTo = safeOauthReturn(String(formData.get("returnTo") ?? ""));
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  const portals = await listPortalsForUser(user.id);
  const destination = signInDestination(portals);
  if (destination.kind === "missing") {
    return { error: "This account is missing its client library." };
  }
  if (destination.kind === "choose") {
    if (returnTo) {
      const home = portals.find((portal) => portal.id === user.clientId) ?? portals[0];
      await clearPortalChoice();
      await createSession({
        userId: user.id,
        email: user.email,
        clientId: home.id,
        inviteCode: home.inviteCode,
      });
      redirect(returnTo);
    }
    await clearSession();
    await createPortalChoice({ userId: user.id, email: user.email });
    redirect(PORTAL_CHOOSER);
  }
  await clearPortalChoice();
  await createSession({
    userId: user.id,
    email: user.email,
    clientId: destination.clientId,
    inviteCode: destination.inviteCode,
  });
  redirect(returnTo ?? CLIENT_HOME);
}

export async function enterPortal(formData: FormData) {
  const choice = await getPortalChoice();
  if (!choice) redirect("/signin");
  const clientId = String(formData.get("clientId") ?? "");
  const [user] = await db.select().from(users).where(eq(users.id, choice.userId)).limit(1);
  const portals = user ? await listPortalsForUser(user.id) : [];
  const portal = portals.find((item) => item.id === clientId);
  if (!user || !portal) {
    redirect(`${PORTAL_CHOOSER}?error=Choose one of your portals.`);
  }
  await createSession({
    userId: user.id,
    email: user.email,
    clientId: portal.id,
    inviteCode: portal.inviteCode,
  });
  await clearPortalChoice();
  redirect(CLIENT_HOME);
}

export async function signOut() {
  await clearSession();
  await clearPortalChoice();
  redirect("/");
}

async function requireClientUser() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || !(await userBelongsToClient(user.id, session.clientId))) {
    await clearSession();
    redirect("/");
  }
  return { session, user };
}

export async function updateProfile(_prev: ActionState | undefined, formData: FormData) {
  const { session, user } = await requireClientUser();
  const profile = parseAccountProfile({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!profile.ok) {
    return { error: profile.error };
  }

  await db
    .update(users)
    .set({
      firstName: profile.value.firstName,
      lastName: profile.value.lastName,
      phone: profile.value.phone,
    })
    .where(eq(users.id, user.id));
  await db
    .update(clients)
    .set({ company: profile.value.companyName })
    .where(eq(clients.id, session.clientId));

  revalidatePath(CLIENT_ACCOUNT);
  revalidatePath(CLIENT_HOME);
  revalidatePath(CLIENT_LIBRARY);
  return { success: "Profile saved." };
}

export async function changePassword(_prev: ActionState | undefined, formData: FormData) {
  const { user } = await requireClientUser();
  const parsed = parsePasswordChange({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  if (!(await compare(parsed.value.currentPassword, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  await db.update(users).set({ passwordHash: await hash(parsed.value.password, 10) }).where(eq(users.id, user.id));
  return { success: "Password updated." };
}

export async function requestPasswordReset(_prev: ActionState | undefined, formData: FormData) {
  await ensureDb();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const [user] = email ? await db.select().from(users).where(eq(users.email, email)).limit(1) : [];
  const result: ActionState = {};

  if (user) {
    const token = randomBytes(24).toString("hex");
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const headerStore = await headers();
    const host = (headerStore.get("x-forwarded-host") || headerStore.get("host") || "127.0.0.1:43173").replace(
      "0.0.0.0",
      "127.0.0.1",
    );
    const proto = headerStore.get("x-forwarded-proto") || "http";
    const resetUrl = `${proto}://${host}/reset-password?token=${token}`;
    if (emailConfigured()) {
      await sendEmail({
        to: user.email,
        subject: "Reset your Client Portal password",
        text: `Reset your password:\n${resetUrl}\n\nThis link expires in one hour.`,
      });
      return result;
    }
    result.resetUrl = resetUrl;
  }

  return result;
}

export async function resetPassword(_prev: ActionState | undefined, formData: FormData) {
  await ensureDb();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) {
    return { error: "This reset link is invalid." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return { error: "This reset link has expired." };
  }
  await db.update(users).set({ passwordHash: await hash(password, 10) }).where(eq(users.id, row.userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.id));
  redirect("/signin");
}
