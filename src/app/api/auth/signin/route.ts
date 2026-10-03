import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clearPortalChoice, clearSession, createPortalChoice, createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { users } from "@/lib/db/schema";
import { PORTAL_CHOOSER } from "@/lib/routes";
import { listPortalsForUser, signInDestination } from "@/lib/user-portals";

export async function POST(request: Request) {
  await ensureDb();
  const body = (await request.json()) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const portals = await listPortalsForUser(user.id);
  const destination = signInDestination(portals);
  if (destination.kind === "missing") {
    return NextResponse.json({ error: "This account is missing its client library." }, { status: 500 });
  }
  if (destination.kind === "choose") {
    await clearSession();
    await createPortalChoice({ userId: user.id, email: user.email });
    return NextResponse.json({ ok: true, choose: PORTAL_CHOOSER });
  }

  await clearPortalChoice();
  await createSession({
    userId: user.id,
    email: user.email,
    clientId: destination.clientId,
    inviteCode: destination.inviteCode,
  });
  return NextResponse.json({ ok: true });
}
