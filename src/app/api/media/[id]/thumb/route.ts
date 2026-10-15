import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media } from "@/lib/db/schema";
import { isNasFilePath, nasEnabled, loadNasThumbnailBytes } from "@/lib/nas";
import { ensureStoredPreview, previewImageResponse } from "@/lib/nas-preview";
import { ThumbnailNotReady, thumbNotReadyHeaders } from "@/lib/thumb-status";

export const runtime = "nodejs";
/** The handler returns in one short NAS try. This cap is only a backstop. */
export const maxDuration = 20;
export const dynamic = "force-dynamic";

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
  const nasPath = item.nasRelativePath;
  if (nasEnabled() && isNasFilePath(nasPath)) {
    try {
      const preview = await ensureStoredPreview({
        mediaId: item.id,
        nasPath,
        wait: false,
        loadBytes: () => loadNasThumbnailBytes(nasPath, { request: true }),
      });
      return previewImageResponse(preview.bytes, preview.contentType, item.filename);
    } catch (error) {
      if (error instanceof ThumbnailNotReady) {
        return NextResponse.json(
          { error: "Thumbnail not ready." },
          { status: 503, headers: thumbNotReadyHeaders(error.retryAfterSeconds) },
        );
      }
      const message = error instanceof Error ? error.message : "NAS thumbnail failed.";
      console.error(`Shoot preview failed for ${item.filename}: ${message}`);
      return NextResponse.json(
        { error: message },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return NextResponse.redirect(new URL(item.url, request.url));
}
