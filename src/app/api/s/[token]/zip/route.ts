import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots } from "@/lib/db/schema";
import { shootFolderName } from "@/lib/media";
import { approxZipSourceBytes, streamShootZip } from "@/lib/shoot-zip";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await ensureDb();
  const [shoot] = await db.select().from(shoots).where(eq(shoots.publicToken, token)).limit(1);
  if (!shoot) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const files = await db
    .select()
    .from(media)
    .where(eq(media.shootId, shoot.id))
    .orderBy(asc(media.sortOrder));
  if (files.length === 0) {
    return NextResponse.json({ error: "This shoot has no files." }, { status: 404 });
  }

  try {
    const origin = new URL(request.url).origin;
    const approxBytes = await approxZipSourceBytes(files);
    return streamShootZip({
      files,
      folderName: shootFolderName(shoot.shotDate, shoot.address),
      origin,
      approxBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zip failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
