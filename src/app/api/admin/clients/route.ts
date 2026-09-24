import { NextResponse } from "next/server";
import { createClientRecord, listClientRows } from "@/lib/admin/clients";
import { getAdminSession } from "@/lib/admin-auth";

export async function POST(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = (await request.json()) as {
    displayName?: string;
    primaryEmail?: string;
    company?: string;
    notes?: string;
  };
  const created = await createClientRecord(body);
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }
  return NextResponse.json({ client: created.value });
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const rows = await listClientRows();
  return NextResponse.json({ clients: rows });
}
