"use server";

import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearInviteCookie,
  clearSession,
  createSession,
  getInviteCookie,
  setInviteCookie,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, passwordResetTokens, users } from "@/lib/db/schema";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";
import { CLIENT_HOME } from "@/lib/routes";

export type ActionState = {
  error?: string;
  resetUrl?: string;
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const inviteCode = normalizeInviteCode(
    String(formData.get("inviteCode") ?? "") || (await getInviteCookie()) || "",
  );

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email." };
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
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { error: "That email already has an account. Sign in instead." };
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hash(password, 10),
      clientId: client.id,
    })
    .returning();

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
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, user.clientId)).limit(1);
  if (!client) {
    return { error: "This account is missing its client library." };
  }
  await createSession({
    userId: user.id,
    email: user.email,
    clientId: client.id,
    inviteCode: client.inviteCode,
  });
  redirect(CLIENT_HOME);
}

export async function signOut() {
  await clearSession();
  redirect("/");
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
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? "Billy Kyle Client Portal <noreply@localhost>";
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: "Reset your Client Portal password",
          text: `Reset your password:\n${resetUrl}\n\nThis link expires in one hour.`,
        }),
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
