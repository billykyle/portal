import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots } from "@/lib/db/schema";
import { zipDownloadName } from "@/lib/download-all";
import { shootFolderName } from "@/lib/media";
import { approxZipSourceBytes, scopeZipRequest, streamShootZip } from "@/lib/shoot-zip";
import { trackShootZipJob } from "@/lib/zip-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  const session = await getSession();
  if (!admin && !session) {
    return NextResponse.json({ error: "Sign in to download this shoot." }, { status: 401 });
  }

  const { id } = await params;
  await ensureDb();
  const [shoot] = admin
    ? await db.select().from(shoots).where(eq(shoots.id, id)).limit(1)
    : await db
        .select()
        .from(shoots)
        .where(and(eq(shoots.id, id), eq(shoots.clientId, session!.clientId)))
        .limit(1);
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
    const scoped = scopeZipRequest(files, request, shootFolderName(shoot.shotDate, shoot.address));
    if (scoped.files.length === 0) {
      return NextResponse.json({ error: "This shoot has no files of that type." }, { status: 404 });
    }
    const approxBytes = await approxZipSourceBytes(scoped.files);
    const tracking = await trackShootZipJob({
      jobId: new URL(request.url).searchParams.get("job"),
      shootId: shoot.id,
      filesTotal: scoped.files.length,
      filename: zipDownloadName(scoped.folderName),
    });
    return streamShootZip({
      files: scoped.files,
      folderName: scoped.folderName,
      origin,
      approxBytes,
      ...tracking,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zip failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
