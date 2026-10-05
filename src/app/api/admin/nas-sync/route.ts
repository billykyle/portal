import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { readManualNasSync, startManualNasSync } from "@/lib/admin/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The walk continues in `after()` on this route, up to the platform limit. */
export const maxDuration = 300;

export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await startManualNasSync("admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.value);
}

export async function GET(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim() || undefined;
  const result = await readManualNasSync(id);
  if (!result.ok) {
    const status = result.error === "NAS sync job was not found." ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.value);
}
