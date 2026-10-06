import { readFile } from "fs/promises";
import path from "path";
import { Readable, Transform } from "stream";
import { ZipFile } from "yazl";
import { openNasOriginalStream } from "./nas";
import { uniqueZipEntryName, zipDownloadName } from "./download-all";
import {
  filterFilesByZipTypes,
  parseZipTypesParam,
  presentMediaTypes,
  zipScopeFolderName,
} from "./download-scope";
import { isNasFilePath, loadNasFileBytes, nasCachedFileSize, nasEnabled } from "./nas";

export type ZipSourceFile = {
  filename: string;
  url: string;
  type?: string;
  nasRelativePath?: string | null;
};

export function scopeZipRequest<T extends ZipSourceFile>(files: T[], request: Request, folderName: string) {
  const types = parseZipTypesParam(new URL(request.url).searchParams.get("types"));
  const scoped = filterFilesByZipTypes(files, types);
  return {
    files: scoped,
    folderName: zipScopeFolderName(folderName, types, presentMediaTypes(files)),
  };
}

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

export type StoredZipEntry = {
  filename: string;
  open: () => Promise<Readable>;
};

async function openZipSourceStream(file: ZipSourceFile, origin: string) {
  if (nasEnabled() && isNasFilePath(file.nasRelativePath)) {
    return openNasOriginalStream(file.nasRelativePath, file.filename);
  }
  const local = await readPublicFile(file.url);
  if (local) return Readable.from(local);
  const href = file.url.startsWith("http") ? file.url : new URL(file.url, origin).href;
  const response = await fetch(href, { cache: "default" });
  if (!response.ok || !response.body) {
    throw new Error(`Could not read ${file.filename}`);
  }
  return Readable.fromWeb(response.body as import("stream/web").ReadableStream);
}

/**
 * STORE zip that opens each original only when yazl is ready for it.
 * Bytes pass through; the whole selection is not buffered first.
 */
export function streamStoredZip(options: {
  entries: StoredZipEntry[];
  folderName: string;
  approxBytes?: number | null;
  onFile?: (info: { filesDone: number; filesTotal: number; bytes: number }) => void | Promise<void>;
  onDone?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}) {
  const zipName = zipDownloadName(options.folderName);
  const zip = new ZipFile();
  const usedNames = new Set<string>();
  const output = zip.outputStream as Readable;
  let failed = false;
  let packed = 0;
  const opened: Readable[] = [];

  function fail(error: unknown) {
    if (failed) return;
    failed = true;
    const reason = error instanceof Error ? error : new Error("Zip failed.");
    void options.onError?.(reason);
    if (!output.destroyed) output.destroy(reason);
  }

  zip.on("error", fail);
  output.on("end", () => {
    if (!failed) void options.onDone?.();
  });
  output.on("close", () => {
    if (output.readableEnded) return;
    for (const source of opened) {
      if (!source.destroyed) source.destroy();
    }
  });

  for (const [index, entry] of options.entries.entries()) {
    const name = uniqueZipEntryName(entry.filename, usedNames);
    zip.addReadStreamLazy(name, { compress: false }, (cb) => {
      let handed = false;
      const hand = (error: Error | null, stream?: Readable) => {
        if (handed) {
          if (error) fail(error);
          return;
        }
        handed = true;
        if (error) cb(error, null as unknown as Readable);
        else cb(null, stream as Readable);
      };
      void entry.open().then(
        (source) => {
          const counter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              packed += chunk.length;
              callback(null, chunk);
            },
          });
          opened.push(source, counter);
          source.on("error", (error) => hand(error));
          counter.on("error", (error) => fail(error));
          counter.on("end", () => {
            void options.onFile?.({
              filesDone: index + 1,
              filesTotal: options.entries.length,
              bytes: packed,
            });
          });
          source.pipe(counter);
          hand(null, counter);
        },
        (error: unknown) => {
          hand(error instanceof Error ? error : new Error("Zip failed."));
        },
      );
    });
  }
  zip.end();

  const stream = Readable.toWeb(output) as ReadableStream<Uint8Array>;
  const headers = new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": contentDispositionAttachment(zipName),
    "Cache-Control": "no-store",
    "X-Zip-File-Count": String(options.entries.length),
    "X-Zip-Filename": zipName,
  });
  if (options.approxBytes && options.approxBytes > 0) {
    headers.set("X-Zip-Approx-Bytes", String(options.approxBytes));
  }
  return new Response(stream, { headers });
}

export function streamSelectionZip(options: {
  files: ZipSourceFile[];
  folderName: string;
  origin: string;
  approxBytes?: number | null;
  onFile?: (info: { filesDone: number; filesTotal: number; bytes: number }) => void | Promise<void>;
  onDone?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}) {
  return streamStoredZip({
    entries: options.files.map((file) => ({
      filename: file.filename,
      open: () => openZipSourceStream(file, options.origin),
    })),
    folderName: options.folderName,
    approxBytes: options.approxBytes,
    onFile: options.onFile,
    onDone: options.onDone,
    onError: options.onError,
  });
}

export function streamShootZip(options: {
  files: ZipSourceFile[];
  folderName: string;
  origin: string;
  approxBytes?: number | null;
  onFile?: (info: { filesDone: number; filesTotal: number; bytes: number }) => void | Promise<void>;
  onDone?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}) {
  const zipName = zipDownloadName(options.folderName);
  const zip = new ZipFile();
  const usedNames = new Set<string>();
  const output = zip.outputStream as Readable;

  void (async () => {
    try {
      let packed = 0;
      for (const [index, file] of options.files.entries()) {
        const bytes = await loadZipSourceBytes(file, options.origin);
        packed += bytes.byteLength;
        zip.addBuffer(bytes, uniqueZipEntryName(file.filename, usedNames), { compress: false });
        await options.onFile?.({
          filesDone: index + 1,
          filesTotal: options.files.length,
          bytes: packed,
        });
      }
      zip.end();
    } catch (error) {
      const failed = error instanceof Error ? error : new Error("Zip failed.");
      await options.onError?.(failed);
      output.destroy(failed);
    }
  })();

  output.on("end", () => {
    void options.onDone?.();
  });

  const stream = Readable.toWeb(output) as ReadableStream<Uint8Array>;
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
