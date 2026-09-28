import { head } from "@vercel/blob";
import { after, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { blobTokenConfigured } from "@/lib/upload/policy";
import { moveUploadSubmission } from "@/lib/upload/run";
import { getUploadSubmission, markUploadStaged } from "@/lib/upload/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!blobTokenConfigured()) {
    return NextResponse.json({ error: "Upload is unavailable." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Upload is unavailable." }, { status: 400 });
  }
  const submissionId =
    body && typeof body === "object" && typeof (body as { submissionId?: unknown }).submissionId === "string"
      ? (body as { submissionId: string }).submissionId
      : "";
  if (!submissionId) return NextResponse.json({ error: "Upload is unavailable." }, { status: 400 });

  await ensureDb();
  const loaded = await getUploadSubmission(submissionId);
  if (!loaded) return NextResponse.json({ error: "Upload is unavailable." }, { status: 404 });
  if (loaded.submission.status === "staged" || loaded.submission.status === "stored" || loaded.submission.status === "moving") {
    return NextResponse.json({ ok: true });
  }
  if (loaded.submission.status !== "open") {
    return NextResponse.json({ error: "Upload is unavailable." }, { status: 400 });
  }

  const confirmed: Array<{ id: string; blobUrl: string }> = [];
  for (const file of loaded.files) {
    let meta: { size: number; url: string };
    try {
      meta = await head(file.blobPathname);
    } catch {
      return NextResponse.json({ error: "Upload is unavailable." }, { status: 400 });
    }
    if (meta.size !== file.sizeBytes) {
      return NextResponse.json({ error: "Upload is unavailable." }, { status: 400 });
    }
    confirmed.push({ id: file.id, blobUrl: meta.url });
  }

  await markUploadStaged(submissionId, confirmed);
  after(() => moveUploadSubmission(submissionId));
  return NextResponse.json({ ok: true });
}
