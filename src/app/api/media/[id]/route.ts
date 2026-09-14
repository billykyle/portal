import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media } from "@/lib/db/schema";
import { isNasFilePath, nasEnabled, proxyNasFile } from "@/lib/nas";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const download = new URL(request.url).searchParams.get("download") === "1";
  const nasPath = item.nasRelativePath;
  if (nasEnabled() && isNasFilePath(nasPath)) {
    try {
      return await proxyNasFile(nasPath, item.filename, download);
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
