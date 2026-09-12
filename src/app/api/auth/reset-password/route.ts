import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { passwordResetTokens, users } from "@/lib/db/schema";

export async function POST(request: Request) {
  await ensureDb();
  const body = (await request.json()) as { token?: string; password?: string };
  const token = body.token ?? "";
  const password = body.password ?? "";
  if (!token) {
    return NextResponse.json({ error: "This reset link is invalid." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This reset link has expired." }, { status: 400 });
  }

  await db
    .update(users)
    .set({ passwordHash: await hash(password, 10) })
    .where(eq(users.id, row.userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.id));
  return NextResponse.json({ ok: true });
}
