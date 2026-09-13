import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { getZipJob, isZipJobId } from "@/lib/zip-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isZipJobId(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await ensureDb();
  const job = await getZipJob(id);
  if (!job) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(job);
}
