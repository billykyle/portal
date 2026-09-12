import { NextResponse } from "next/server";
import { adminPasswordMatches, createAdminSession } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  if (!adminPasswordMatches(body.password ?? "")) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 401 });
  }
  await createAdminSession();
  return NextResponse.json({ ok: true });
}
