import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { passwordResetTokens, users } from "@/lib/db/schema";

export async function POST(request: Request) {
  await ensureDb();
  const body = (await request.json()) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const [user] = email ? await db.select().from(users).where(eq(users.email, email)).limit(1) : [];

  let resetUrl: string | undefined;
  if (user) {
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });
    const origin = new URL(request.url).origin;
    resetUrl = `${origin}/reset-password?token=${token}`;

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
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true, resetUrl });
}
