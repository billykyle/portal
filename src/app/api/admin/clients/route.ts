import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { formatInviteCode, parseInviteSequence } from "@/lib/invite";

export async function POST(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDb();
  const body = (await request.json()) as {
    displayName?: string;
    primaryEmail?: string;
    company?: string;
    notes?: string;
  };
  const displayName = (body.displayName ?? "").trim();
  const primaryEmail = (body.primaryEmail ?? "").trim().toLowerCase();
  if (!displayName) {
    return NextResponse.json({ error: "Display name is required." }, { status: 400 });
  }
  if (!primaryEmail || !primaryEmail.includes("@")) {
    return NextResponse.json({ error: "Primary contact email is required." }, { status: 400 });
  }

  const existing = await db.select({ inviteCode: clients.inviteCode }).from(clients);
  const next = existing.reduce((max, row) => {
    const value = parseInviteSequence(row.inviteCode) ?? 0;
    return Math.max(max, value);
  }, 0) + 1;

  const [client] = await db
    .insert(clients)
    .values({
      inviteCode: formatInviteCode(next),
      displayName,
      primaryEmail,
      company: body.company?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .returning();

  return NextResponse.json({ client });
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDb();
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));
  return NextResponse.json({ clients: rows });
}
