import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { setInviteCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";

export async function POST(request: Request) {
  await ensureDb();
  const body = (await request.json()) as { code?: string };
  const code = normalizeInviteCode(body.code ?? "");
  if (!isInviteCode(code)) {
    return NextResponse.json({ error: "Invite codes look like BK00001." }, { status: 400 });
  }
  const [client] = await db.select().from(clients).where(eq(clients.inviteCode, code)).limit(1);
  if (!client) {
    return NextResponse.json({ error: "That invite code was not found." }, { status: 404 });
  }
  await setInviteCookie(code);
  return NextResponse.json({ ok: true, inviteCode: code });
}
