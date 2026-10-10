import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media } from "@/lib/db/schema";
import { resolvePublicShare } from "@/lib/public-share-slug";
import { zipDownloadName } from "@/lib/download-all";
import { selectionZipResponse } from "@/lib/selection-zip";
import { shootFolderName } from "@/lib/media";
import { authorizeZipDownload } from "@/lib/shoot-selection";
import { approxZipSourceBytes, scopeZipRequest, streamShootZip } from "@/lib/shoot-zip";
import { trackShootZipJob } from "@/lib/zip-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await ensureDb();
  const resolved = await resolvePublicShare(token);
  const shoot = resolved?.shoot ?? null;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await ensureDb();
  const resolved = await resolvePublicShare(token);
  const shoot = resolved?.shoot ?? null;
  const access = authorizeZipDownload({
    kind: "share",
    admin: false,
    session: null,
    accessibleClientIds: [],
    shoot,
    shareToken: token,
    shareVia: resolved?.via,
  });
  if (!access.ok || !shoot) {
    return NextResponse.json(
      { error: access.ok ? "Not found." : access.error },
      { status: access.ok ? 404 : access.status },
    );
  }

  const files = await db
    .select()
    .from(media)
    .where(eq(media.shootId, shoot.id))
    .orderBy(asc(media.sortOrder));
  return selectionZipResponse(request, shoot, files);
}
