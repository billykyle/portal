import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import {
  blobTokenConfigured,
  consumeUploadRate,
  parseUploadRequest,
  uploadClientKey,
} from "@/lib/upload/policy";
import { reserveUploadSubmission } from "@/lib/upload/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!blobTokenConfigured()) {
    return NextResponse.json({ error: "Upload is unavailable." }, { status: 503 });
  }
  const rate = consumeUploadRate(uploadClientKey(request));
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter what you are uploading." }, { status: 400 });
  }
  const parsed = parseUploadRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  await ensureDb();
  const reserved = await reserveUploadSubmission(parsed);
  return NextResponse.json({
    submissionId: reserved.submissionId,
    files: reserved.files.map((file) => ({
      id: file.id,
      pathname: file.blobPathname,
    })),
  });
}
