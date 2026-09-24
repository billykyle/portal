import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

/**
 * Bytes of a file the browser asked for.
 * `null` means there was no usable Range header (send the whole file).
 */
export function parseByteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (header == null) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (!/^bytes=/i.test(trimmed)) return null;
  const spec = trimmed.slice(trimmed.indexOf("=") + 1).split(",")[0]?.trim() ?? "";
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (match[1] === "" && match[2] === "")) return "unsatisfiable";
  if (size <= 0) return "unsatisfiable";

  const [, startRaw, endRaw] = match;
  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    const length = Math.min(suffix, size);
    return { start: size - length, end: size - 1 };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start < 0 || start >= size) return "unsatisfiable";
  let end = endRaw === "" ? size - 1 : Number(endRaw);
  if (!Number.isFinite(end) || end < start) return "unsatisfiable";
  if (end >= size) end = size - 1;
  return { start, end };
}

function extension(filename: string) {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * MIME type for an in-app file response.
 * `.mov` is served as `video/mp4`: Chrome, Edge, and Firefox refuse `video/quicktime`,
 * and the NAS delivers H.264 `.mov` shoots (MLS / walkthrough) that those browsers
 * play when the type is `video/mp4`. Safari plays that type as well.
 */
export function mediaContentType(filename: string) {
  const ext = extension(filename);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  if (ext === "mp4" || ext === "m4v" || ext === "mov") return "video/mp4";
  if (ext === "webm") return "video/webm";
  return "application/octet-stream";
}

/** `<source type>` for a shoot video. Matches `mediaContentType` for imported extensions. */
export function videoSourceType(filename: string) {
  const type = mediaContentType(filename);
  return type.startsWith("video/") ? type : "video/mp4";
}

function contentDisposition(download: boolean, filename: string) {
  const safe = filename.replace(/["\\]/g, "_").replace(/[\r\n]/g, "");
  return `${download ? "attachment" : "inline"}; filename="${safe}"`;
}

function baseHeaders(filename: string, download: boolean) {
  return {
    "Content-Type": mediaContentType(filename),
    "Content-Disposition": contentDisposition(download, filename),
    "Cache-Control": "private, no-transform, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
}

/** Headers for a full-file stream whose length is not known yet. */
export function openMediaHeaders(filename: string, download: boolean, size: number | null) {
  const headers: Record<string, string> = baseHeaders(filename, download);
  if (size != null) {
    headers["Accept-Ranges"] = "bytes";
    headers["Content-Length"] = String(size);
  }
  return headers;
}

export type MediaResponsePlan =
  | { kind: "unsatisfiable"; status: 416; headers: Record<string, string> }
  | {
      kind: "bytes";
      status: 200 | 206;
      start: number;
      end: number;
      headers: Record<string, string>;
    };

/** Decide status, bounds, and headers for one media GET. `end` is inclusive. */
export function planMediaResponse(input: {
  size: number;
  rangeHeader: string | null;
  filename: string;
  download: boolean;
}): MediaResponsePlan {
  const size = input.size < 0 ? 0 : input.size;
  const shared = {
    ...baseHeaders(input.filename, input.download),
    "Accept-Ranges": "bytes",
  };
  const parsed = parseByteRange(input.rangeHeader, size);
  if (parsed === "unsatisfiable") {
    return {
      kind: "unsatisfiable",
      status: 416,
      headers: { ...shared, "Content-Range": `bytes */${size}`, "Content-Length": "0" },
    };
  }
  const start = parsed?.start ?? 0;
  const end = parsed ? parsed.end : size > 0 ? size - 1 : -1;
  const length = end >= start ? end - start + 1 : 0;
  const headers: Record<string, string> = { ...shared, "Content-Length": String(length) };
  if (parsed) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return { kind: "bytes", status: parsed ? 206 : 200, start, end, headers };
}

/** Stream a cached file, honoring a single byte range. */
export async function mediaFileResponse(
  filePath: string,
  options: { filename: string; download: boolean; rangeHeader: string | null },
) {
  const info = await stat(/* turbopackIgnore: true */ filePath);
  const plan = planMediaResponse({
    size: info.size,
    rangeHeader: options.rangeHeader,
    filename: options.filename,
    download: options.download,
  });
  if (plan.kind === "unsatisfiable" || plan.end < plan.start) {
    return new Response(null, {
      status: plan.kind === "unsatisfiable" ? 416 : plan.status,
      headers: plan.headers,
    });
  }
  const node = createReadStream(/* turbopackIgnore: true */ filePath, {
    start: plan.start,
    end: plan.end,
  });
  const stream = Readable.toWeb(node) as ReadableStream;
  return new Response(stream, { status: plan.status, headers: plan.headers });
}
