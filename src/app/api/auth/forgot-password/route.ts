import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { emailConfigured, sendEmail } from "@/lib/email";

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
    const url = new URL(request.url);
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host).replace(
      "0.0.0.0",
      "127.0.0.1",
    );
    const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
    resetUrl = `${proto}://${host}/reset-password?token=${token}`;

    if (emailConfigured()) {
      await sendEmail({
        to: user.email,
        subject: "Reset your Client Portal password",
        text: `Reset your password:\n${resetUrl}\n\nThis link expires in one hour.`,
      });
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true, resetUrl });
}
