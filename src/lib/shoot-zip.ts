import { readFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { ZipFile } from "yazl";
import { uniqueZipEntryName, zipDownloadName } from "./download-all";
import { isNasFilePath, loadNasFileBytes, nasCachedFileSize, nasEnabled } from "./nas";

export type ZipSourceFile = {
  filename: string;
  url: string;
  nasRelativePath?: string | null;
};

export function contentDispositionAttachment(filename: string) {
  const safe = filename.replace(/["\\\r\n]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export function extrapolateApproxBytes(knownBytes: number, knownCount: number, totalCount: number) {
  if (knownCount <= 0 || totalCount <= 0) return null;
  return Math.round((knownBytes / knownCount) * totalCount);
}

export async function approxZipSourceBytes(files: ZipSourceFile[]) {
  let knownBytes = 0;
  let knownCount = 0;
  for (const file of files) {
    if (!isNasFilePath(file.nasRelativePath)) continue;
    const size = await nasCachedFileSize(file.nasRelativePath, file.filename);
    if (size != null) {
      knownBytes += size;
      knownCount += 1;
    }
  }
  return extrapolateApproxBytes(knownBytes, knownCount, files.length);
}

async function readPublicFile(urlPath: string) {
  const clean = urlPath.split("?")[0];
  if (!clean.startsWith("/") || clean.startsWith("/api/") || clean.includes("..")) {
    return null;
  }
  try {
    return await readFile(path.join(process.cwd(), "public", decodeURIComponent(clean)));
  } catch {
    return null;
  }
}

export async function loadZipSourceBytes(file: ZipSourceFile, origin: string) {
  if (nasEnabled() && isNasFilePath(file.nasRelativePath)) {
    return loadNasFileBytes(file.nasRelativePath, file.filename);
  }
  const local = await readPublicFile(file.url);
  if (local) return local;
  const href = file.url.startsWith("http") ? file.url : new URL(file.url, origin).href;
  const response = await fetch(href, { cache: "default" });
  if (!response.ok) {
    throw new Error(`Could not read ${file.filename}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function streamShootZip(options: {
  files: ZipSourceFile[];
  folderName: string;
  origin: string;
  approxBytes?: number | null;
}) {
  const zipName = zipDownloadName(options.folderName);
  const zip = new ZipFile();
  const usedNames = new Set<string>();

  void (async () => {
    try {
      for (const file of options.files) {
        const bytes = await loadZipSourceBytes(file, options.origin);
        zip.addBuffer(bytes, uniqueZipEntryName(file.filename, usedNames), { compress: false });
      }
      zip.end();
    } catch (error) {
      const failed = error instanceof Error ? error : new Error("Zip failed.");
      (zip.outputStream as Readable).destroy(failed);
    }
  })();

  const stream = Readable.toWeb(zip.outputStream as Readable) as ReadableStream<Uint8Array>;
  const headers = new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": contentDispositionAttachment(zipName),
    "Cache-Control": "no-store",
    "X-Zip-File-Count": String(options.files.length),
    "X-Zip-Filename": zipName,
  });
  if (options.approxBytes && options.approxBytes > 0) {
    headers.set("X-Zip-Approx-Bytes", String(options.approxBytes));
  }

  return new Response(stream, { headers });
}
