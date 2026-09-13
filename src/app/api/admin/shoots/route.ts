import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { shoots } from "@/lib/db/schema";
import { importNasStills, resolveShootFolder } from "@/lib/nas-import";
import { nasEnabled } from "@/lib/nas";
import { createPublicToken } from "@/lib/public-link";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDb();
  const body = (await request.json()) as {
    clientId?: string;
    shotDate?: string;
    address?: string;
    dropboxUrl?: string;
    nasRelativePath?: string;
  };

  const clientId = body.clientId ?? "";
  const shotDate = (body.shotDate ?? "").trim();
  const address = (body.address ?? "").trim();
  const nasRelativePath = body.nasRelativePath?.trim() ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shotDate)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }
  if (!nasRelativePath) {
    return NextResponse.json({ error: "NAS folder is required. Files come from the share only." }, { status: 400 });
  }
  if (!nasEnabled()) {
    return NextResponse.json({ error: "Turn on NAS_ENABLED to attach a shoot." }, { status: 400 });
  }

  const [shoot] = await db
    .insert(shoots)
    .values({
      clientId,
      publicToken: createPublicToken(),
      shotDate,
      address,
      nasRelativePath,
      dropboxUrl: body.dropboxUrl?.trim() || null,
    })
    .returning();

  try {
    const folder = await resolveShootFolder(nasRelativePath);
    await importNasStills(shoot.id, folder, { required: true });
  } catch (error) {
    await db.delete(shoots).where(eq(shoots.id, shoot.id));
    const message = error instanceof Error ? error.message : "NAS import failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ shoot });
}
