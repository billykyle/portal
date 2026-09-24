import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media } from "@/lib/db/schema";
import { isNasFilePath, nasEnabled, proxyNasFile } from "@/lib/nas";
import { isVideoQuality, renditionFilename, selectServedVideo } from "@/lib/video-renditions";
import { listVideoRenditions } from "@/lib/video-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await ensureDb();
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!item) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const requested = url.searchParams.get("rendition");
  const range = request.headers.get("range");
  if (!download && isVideoQuality(requested) && item.type === "video" && nasEnabled()) {
    const renditions = await listVideoRenditions([item.id]);
    const served = selectServedVideo({
      download: false,
      rendition: requested,
      original: { path: item.nasRelativePath ?? "", filename: item.filename },
      renditions: renditions.map((row) => ({ quality: row.quality, path: row.nasRelativePath })),
    });
    if (served.kind === "rendition" && isNasFilePath(served.path)) {
      try {
        return await proxyNasFile(served.path, renditionFilename(item.filename, requested), false, range);
      } catch (error) {
        console.error(`Rendition ${requested} failed for ${item.filename}; serving the original.`, error);
      }
    }
  }
  const nasPath = item.nasRelativePath;
  if (nasEnabled() && isNasFilePath(nasPath)) {
    try {
      return await proxyNasFile(nasPath, item.filename, download, range);
    } catch (error) {
      const message = error instanceof Error ? error.message : "NAS proxy failed.";
      return NextResponse.json(
        { error: message },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return NextResponse.redirect(new URL(item.url, request.url));
}
