import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots, type MediaType } from "@/lib/db/schema";
import { joinUrl } from "@/lib/media";
import { mapleMedia } from "@/lib/sample-media";

function guessType(filename: string): MediaType {
  const lower = filename.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(lower)) return "video";
  if (/(floor|plan)/.test(lower) || /\.svg$/.test(lower) || /\.pdf$/.test(lower)) return "floor_plan";
  return "photo";
}

export async function POST(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDb();
  const body = (await request.json()) as {
    clientId?: string;
    shotDate?: string;
    address?: string;
    dropboxUrl?: string;
    nasRelativePath?: string;
    usePlaceholderMedia?: boolean;
    mediaPaths?: string;
  };

  const clientId = body.clientId ?? "";
  const shotDate = (body.shotDate ?? "").trim();
  const address = (body.address ?? "").trim();
  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shotDate)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  const nasRelativePath =
    body.nasRelativePath?.trim() || `${shotDate} - ${address}`;

  const [shoot] = await db
    .insert(shoots)
    .values({
      clientId,
      shotDate,
      address,
      nasRelativePath,
      dropboxUrl: body.dropboxUrl?.trim() || null,
    })
    .returning();

  if (body.usePlaceholderMedia) {
    await db.insert(media).values(
      mapleMedia.map((item) => ({
        ...item,
        shootId: shoot.id,
        nasRelativePath: `${nasRelativePath}/${item.filename}`,
      })),
    );
  } else {
    const lines = (body.mediaPaths ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const nasBase = process.env.NAS_BASE_URL?.trim();
    const rows = lines.map((line, index) => {
      const isAbsolute = /^https?:\/\//i.test(line) || line.startsWith("/");
      const filename = line.split("/").filter(Boolean).at(-1) ?? `file-${index + 1}`;
      const relative = isAbsolute ? `${nasRelativePath}/${filename}` : line.replace(/^\/+/, "");
      return {
        shootId: shoot.id,
        type: guessType(filename),
        filename,
        url: isAbsolute ? line : nasBase ? joinUrl(nasBase, relative) : "/samples/maple-exterior.jpg",
        nasRelativePath: relative,
        sortOrder: index + 1,
      };
    });
    if (rows.length > 0) {
      await db.insert(media).values(rows);
    }
  }

  return NextResponse.json({ shoot });
}
