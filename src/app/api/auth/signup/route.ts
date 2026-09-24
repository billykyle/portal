import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clearInviteCookie, createSession, getInviteCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, users } from "@/lib/db/schema";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";
import { recordInviteRedeemedContact } from "@/lib/client-contact";
import { parseSignupProfile } from "@/lib/signup-fields";

export async function POST(request: Request) {
  await ensureDb();
  const body = (await request.json()) as {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    password?: string;
    inviteCode?: string;
  };
  const profile = parseSignupProfile(body);
  const password = body.password ?? "";
  const inviteCode = normalizeInviteCode(body.inviteCode || (await getInviteCookie()) || "");

  if (!profile.ok) {
    return NextResponse.json({ error: profile.error }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!isInviteCode(inviteCode)) {
    return NextResponse.json({ error: "Enter an invite code first." }, { status: 400 });
  }

  const [client] = await db.select().from(clients).where(eq(clients.inviteCode, inviteCode)).limit(1);
  if (!client) {
    return NextResponse.json({ error: "That invite code was not found." }, { status: 404 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, profile.value.email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "That email already has an account. Sign in instead." }, { status: 409 });
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
  return NextResponse.json({ ok: true });
}
