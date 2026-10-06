import { NextResponse } from "next/server";
import { zipDownloadName } from "@/lib/download-all";
import { shootFolderName } from "@/lib/media";
import { filesForSelection, readSelectionIds } from "@/lib/shoot-selection";
import { approxZipSourceBytes, streamSelectionZip, type ZipSourceFile } from "@/lib/shoot-zip";
import { trackShootZipJob } from "@/lib/zip-jobs";

type SelectionFile = ZipSourceFile & { id: string };

/** Zip the posted ids after the route has already authorized the shoot. */
export async function selectionZipResponse(
  request: Request,
  shoot: { id: string; shotDate: string; address: string },
  shootFiles: readonly SelectionFile[],
) {
  const parsed = await readSelectionIds(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const picked = filesForSelection(shootFiles, parsed.ids);
  if (!picked.ok) {
    return NextResponse.json({ error: picked.error }, { status: picked.status });
  }

  try {
    const folderName = shootFolderName(shoot.shotDate, shoot.address);
    const approxBytes = await approxZipSourceBytes(picked.files);
    const tracking = await trackShootZipJob({
      jobId: new URL(request.url).searchParams.get("job"),
      shootId: shoot.id,
      filesTotal: picked.files.length,
      filename: zipDownloadName(folderName),
    });
    return streamSelectionZip({
      files: picked.files,
      folderName,
      origin: new URL(request.url).origin,
      approxBytes,
      ...tracking,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zip failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
