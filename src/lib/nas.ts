import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { mediaFileResponse, openMediaHeaders, planMediaResponse } from "./media-response";
import { isNasAuthError } from "./nas-auth";
import { collectNasDeliverables, type NasDeliverable } from "./nas-media";
import {
  acceptedPreview,
  lockAndRefreshShareCookie,
  MAX_PREVIEW_BYTES,
  PreviewStoreUnavailable,
  previewImageResponse,
  readCappedBytes,
  readFreshShareSession,
} from "./nas-preview";
import { isVercelRuntime } from "./runtime";

export { isNasFilePath, nasEnabled } from "./nas-flags";

export type NasFile = {
  path: string;
  name: string;
  fileType: number;
  size: number;
};

export type NasConfig = {
  host: string;
  shareId: string;
  password: string;
  stillsFolders: string[];
  cacheDir: string;
};

const DEFAULT_STILLS = ["Final", "Photos"];
export const NAS_DIR = 1;

let cachedCookie: string | null = null;
let cachedRootPath: string | null = null;
let cookieInFlight: Promise<void> | null = null;
let resolvedHost: string | null = null;

function parseShareIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get("id")?.trim() || "";
  } catch {
    return "";
  }
}

export function defaultNasCacheDir() {
  const configured = process.env.NAS_CACHE_DIR?.trim();
  if (configured) return configured;
  if (isVercelRuntime()) return path.join("/tmp", "nas-cache");
  return path.join(process.cwd(), ".nas-cache");
}

function nasCacheFilePath(kind: "thumbs" | "files", filename: string) {
  const configured = process.env.NAS_CACHE_DIR?.trim();
  if (configured) {
    return path.join(/* turbopackIgnore: true */ configured, kind, filename);
  }
  if (isVercelRuntime()) {
    return path.join("/tmp", "nas-cache", kind, filename);
  }
  return path.join(process.cwd(), ".nas-cache", kind, filename);
}

function nasCacheKindDir(kind: "thumbs" | "files") {
  const configured = process.env.NAS_CACHE_DIR?.trim();
  if (configured) {
    return path.join(/* turbopackIgnore: true */ configured, kind);
  }
  if (isVercelRuntime()) {
    return path.join("/tmp", "nas-cache", kind);
  }
  return path.join(process.cwd(), ".nas-cache", kind);
}

export function getNasConfig(): NasConfig | null {
  const shareUrl = process.env.NAS_SHARE_URL?.trim() ?? "";
  const shareId = process.env.NAS_SHARE_ID?.trim() || parseShareIdFromUrl(shareUrl);
  const host = (process.env.NAS_SHARE_HOST?.trim() || resolvedHost || "").replace(/\/+$/, "");
  if (!shareId) return null;
  if (!host && !shareUrl) return null;
  const folders = (process.env.NAS_STILLS_FOLDERS ?? DEFAULT_STILLS.join(","))
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    host: host || shareUrl,
    shareId,
    password: process.env.NAS_SHARE_PASSWORD ?? "",
    stillsFolders: folders.length > 0 ? folders : DEFAULT_STILLS,
    cacheDir: defaultNasCacheDir(),
  };
}

function apiBase(config: NasConfig) {
  return `${config.host.replace(/\/+$/, "")}/ugreen/v1`;
}

function sharePage(config: NasConfig) {
  return `${config.host.replace(/\/+$/, "")}/filemgr/share-download/?id=${config.shareId}`;
}

function jsonHeaders(config: NasConfig, cookie?: string): HeadersInit {
  return {
    "UG-Agent": "PC/WEB",
    "X-Specify-Language": "en-US",
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Origin: config.host,
    Referer: sharePage(config),
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function mediaHeaders(config: NasConfig, cookie: string): HeadersInit {
  return {
    "UG-Agent": "PC/WEB",
    Accept: "image/*,application/octet-stream,*/*",
    Origin: config.host,
    Referer: sharePage(config),
    Cookie: cookie,
  };
}

function cookieFromResponse(res: Response) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter((value): value is string => Boolean(value));
  for (const entry of raw) {
    const match = entry.match(/(share_cookie_[^=]+)=([^;]+)/);
    if (match) return `${match[1]}=${match[2]}`;
  }
  return null;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`NAS returned non-JSON (${res.status}): ${text.slice(0, 180)}`);
  }
}

type UgosResponse<T> = {
  code: number;
  msg?: string;
  data?: T;
};

function isMarketingShareHost(host: string) {
  try {
    const url = new URL(host.includes("://") ? host : `https://${host}`);
    return url.hostname === "ug.link" || url.hostname === "www.ug.link";
  } catch {
    return true;
  }
}

async function ensureHost(config: NasConfig) {
  if (resolvedHost) {
    return { ...config, host: resolvedHost };
  }
  const fromEnv = process.env.NAS_SHARE_HOST?.trim().replace(/\/+$/, "");
  if (fromEnv && !isMarketingShareHost(fromEnv)) {
    resolvedHost = fromEnv;
    return { ...config, host: resolvedHost };
  }
  if (!isMarketingShareHost(config.host)) {
    resolvedHost = config.host.replace(/\/+$/, "");
    return { ...config, host: resolvedHost };
  }
  const probe = process.env.NAS_SHARE_URL?.trim() || config.host;
  const res = await fetch(probe, { method: "GET", redirect: "follow" });
  resolvedHost = new URL(res.url).origin;
  return { ...config, host: resolvedHost };
}

async function verifyShare(config: NasConfig) {
  const live = await ensureHost(config);
  const res = await fetch(`${apiBase(live)}/filemgr/externalVerifySharePassword`, {
    method: "POST",
    headers: jsonHeaders(live),
    body: JSON.stringify({
      share_id: live.shareId,
      password: live.password,
      token: "",
      no_count: Boolean(cachedCookie),
    }),
    cache: "no-store",
  });
  const cookie = cookieFromResponse(res) ?? cachedCookie;
  const body = await readJson<
    UgosResponse<{ file_info?: Array<{ path: string; name: string; file_type: number }> }>
  >(res);
  if (body.code !== 200) {
    throw new Error(body.msg || "NAS share verify failed.");
  }
  if (!cookie) {
    throw new Error("NAS share did not set a share cookie.");
  }
  cachedCookie = cookie;
  cachedRootPath = body.data?.file_info?.[0]?.path ?? cachedRootPath;
  return { config: live, cookie, rootPath: cachedRootPath ?? "" };
}

function rememberShareSession(session: { cookie: string; host: string; rootPath: string }) {
  cachedCookie = session.cookie;
  if (session.rootPath) cachedRootPath = session.rootPath;
  if (session.host) resolvedHost = session.host;
}

async function refreshShareSession(base: NasConfig, failedCookie?: string) {
  try {
    const session = await lockAndRefreshShareCookie(failedCookie, async () => {
      const verified = await verifyShare(base);
      return {
        cookie: verified.cookie,
        host: verified.config.host,
        rootPath: verified.rootPath,
      };
    });
    rememberShareSession(session);
  } catch (error) {
    if (!(error instanceof PreviewStoreUnavailable)) throw error;
    const verified = await verifyShare(base);
    rememberShareSession({
      cookie: verified.cookie,
      host: verified.config.host,
      rootPath: verified.rootPath,
    });
  }
}

async function withCookie<T>(fn: (config: NasConfig, cookie: string) => Promise<T>): Promise<T> {
  const base = getNasConfig();
  if (!base) throw new Error("NAS share is not configured.");
  const run = async (force: boolean, failedCookie?: string) => {
    if (force) {
      cachedCookie = null;
      cachedRootPath = null;
    }
    if (!cachedCookie) {
      // Cold isolates used to each call verify and replace share_cookie, which
      // cancelled every other in-flight tile (the blue ? icons).
      const shared = force ? null : await readFreshShareSession(failedCookie);
      if (shared) rememberShareSession(shared);
    }
    if (!cachedCookie) {
      cookieInFlight ??= refreshShareSession(base, failedCookie).finally(() => {
        cookieInFlight = null;
      });
      await cookieInFlight;
    }
    const live = await ensureHost(base);
    if (!cachedCookie) throw new Error("NAS share cookie is missing.");
    return fn(live, cachedCookie);
  };
  try {
    return await run(false);
  } catch (error) {
    // Re-verify only when the share cookie is actually dead. A failed
    // thumbnail/download used to clear the cookie and mint a new one, which
    // invalidated every other in-flight tile on this isolate (blue ? icons).
    if (!isNasAuthError(error)) throw error;
    const failed = cachedCookie ?? undefined;
    cachedCookie = null;
    cachedRootPath = null;
    return run(true, failed);
  }
}

export async function nasShareRoot() {
  if (cachedRootPath && cachedCookie) return cachedRootPath;
  const base = getNasConfig();
  if (!base) throw new Error("NAS share is not configured.");
  const { rootPath } = await verifyShare(base);
  return rootPath;
}

export function resolveNasPath(shareRoot: string, relativeOrAbsolute: string) {
  const trimmed = relativeOrAbsolute.trim();
  if (trimmed.startsWith("/")) return trimmed;
  const root = shareRoot.replace(/\/+$/, "");
  const rel = trimmed.replace(/^\/+/, "");
  return rel ? `${root}/${rel}` : root;
}

export async function listNasDir(dirPath: string): Promise<NasFile[]> {
  return withCookie(async (config, cookie) => {
    const res = await fetch(`${apiBase(config)}/filemgr/getShearDirFileList`, {
      method: "POST",
      headers: jsonHeaders(config, cookie),
      body: JSON.stringify({
        token: "",
        share_id: config.shareId,
        password: config.password,
        path: dirPath,
        page: 1,
        limit: 1000,
        sort_type: 1,
        as_dir: false,
        reverse: false,
        file_exts: [],
      }),
      cache: "no-store",
    });
    const body = await readJson<
      UgosResponse<{ files?: Array<{ path: string; name: string; file_type: number; size: number }> }>
    >(res);
    if (body.code !== 200) {
      throw new Error(body.msg || `NAS list failed for ${dirPath}`);
    }
    return (body.data?.files ?? []).map((file) => ({
      path: file.path,
      name: file.name,
      fileType: file.file_type,
      size: file.size,
    }));
  });
}

export function isNasDirectory(file: NasFile) {
  return file.fileType === NAS_DIR;
}

export function isHiddenNasName(name: string) {
  return name.startsWith(".") || name.startsWith("_");
}

export async function listNasDirectories(dirPath: string) {
  const entries = await listNasDir(dirPath);
  return entries.filter(isNasDirectory).filter((entry) => !isHiddenNasName(entry.name));
}

export async function findStillsFolder(shootFolderPath: string) {
  const config = getNasConfig();
  if (!config) throw new Error("NAS share is not configured.");
  const dirs = await listNasDirectories(shootFolderPath);
  const wanted = config.stillsFolders.map((name) => name.toLowerCase());
  return dirs.find((dir) => wanted.includes(dir.name.toLowerCase())) ?? null;
}

export type NasMediaFile = NasFile & NasDeliverable;

export async function listNasMedia(shootFolderPath: string): Promise<NasMediaFile[]> {
  const config = getNasConfig();
  if (!config) throw new Error("NAS share is not configured.");
  const deliverables = await collectNasDeliverables({
    shootFolderPath,
    stillsFolders: config.stillsFolders,
    list: async (dirPath) => {
      const files = await listNasDir(dirPath);
      return files.map((file) => ({
        name: file.name,
        path: file.path,
        isDir: isNasDirectory(file),
      }));
    },
  });
  return deliverables.map((file) => ({
    path: file.path,
    name: file.name,
    fileType: 0,
    size: 0,
    type: file.type,
  }));
}

/** Photos only — prefer `listNasMedia` when floor plans or video should come along. */
export async function listNasStills(shootFolderPath: string) {
  const files = await listNasMedia(shootFolderPath);
  return files.filter((file) => file.type === "photo");
}

function cacheKey(nasPath: string) {
  return createHash("sha256").update(nasPath).digest("hex").slice(0, 32);
}

async function cachedFile(kind: "thumbs" | "files", nasPath: string, ext: string) {
  if (!getNasConfig()) return null;
  const filePath = nasCacheFilePath(kind, `${cacheKey(nasPath)}.${ext}`);
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath);
    if (info.size > 0) return filePath;
  } catch {
    /* miss */
  }
  return null;
}

async function writeCache(kind: "thumbs" | "files", nasPath: string, ext: string, bytes: Buffer) {
  if (!getNasConfig()) return;
  const filePath = nasCacheFilePath(kind, `${cacheKey(nasPath)}.${ext}`);
  await mkdir(/* turbopackIgnore: true */ nasCacheKindDir(kind), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ filePath, bytes);
  return filePath;
}

function extensionFrom(name: string, fallback: string) {
  const ext = path.extname(name).replace(".", "").toLowerCase();
  return ext || fallback;
}

const queueNasThumbnail = createQueue(3);

async function fetchNasThumbnailBytes(nasPath: string) {
  return withCookie(async (config, cookie) => {
    const url = new URL(`${apiBase(config)}/filemgr/shareThumbnail`);
    url.searchParams.set("path", nasPath);
    url.searchParams.set("type", "1");
    // size_type=3 is ~1920px / 400KB — too heavy for a 3-column phone grid.
    // size_type=1 is ~44KB and still sharp enough for tiles.
    url.searchParams.set("size_type", "1");
    const res = await fetch(url, { headers: mediaHeaders(config, cookie), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json") || type.includes("text/") || !res.ok) {
      const body = await res.text();
      throw new Error(`NAS thumbnail failed: ${body.slice(0, 180)}`);
    }
    const bytes = await readCappedBytes(res, MAX_PREVIEW_BYTES);
    const contentType = acceptedPreview(type, bytes.length);
    if (!contentType) {
      throw new Error(`NAS thumbnail was ${bytes.length} bytes (${type || "unknown type"}) — not a grid preview.`);
    }
    try {
      await writeCache("thumbs", `${nasPath}#t1`, "jpg", bytes);
    } catch (error) {
      console.error("Preview disk cache failed:", error);
    }
    return { bytes, contentType };
  });
}

/** Small NAS thumbnail bytes. Disk cache is same-isolate scratch; Postgres is durable. */
export async function loadNasThumbnailBytes(nasPath: string) {
  const hit = await cachedFile("thumbs", `${nasPath}#t1`, "jpg");
  if (hit) {
    try {
      const bytes = await readFile(/* turbopackIgnore: true */ hit);
      const contentType = acceptedPreview("image/jpeg", bytes.length);
      if (contentType) return { bytes, contentType };
    } catch {
      /* Refetch when the scratch file is unreadable or a full-size original. */
    }
  }

  return queueNasThumbnail(async () => {
    const again = await cachedFile("thumbs", `${nasPath}#t1`, "jpg");
    if (again) {
      try {
        const bytes = await readFile(/* turbopackIgnore: true */ again);
        const contentType = acceptedPreview("image/jpeg", bytes.length);
        if (contentType) return { bytes, contentType };
      } catch {
        /* The winner of the queue writes the scratch file; otherwise refetch. */
      }
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await fetchNasThumbnailBytes(nasPath);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("NAS thumbnail failed.");
  });
}

export async function proxyNasThumbnail(nasPath: string, filename: string) {
  const loaded = await loadNasThumbnailBytes(nasPath);
  return previewImageResponse(loaded.bytes, loaded.contentType, filename);
}

let fileProxyChain: Promise<unknown> = Promise.resolve();

function createQueue(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function enqueue<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        run().then(resolve, reject).finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < concurrency) start();
      else waiting.push(start);
    });
  };
}

function queueNasDownload<T>(run: () => Promise<T>): Promise<T> {
  const queued = fileProxyChain.then(run, run);
  fileProxyChain = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function withNasDownloadRetries<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("NAS download failed.");
}

async function openNasDownload(nasPath: string, rangeHeader?: string | null) {
  return withCookie(async (config, cookie) => {
    const taskRes = await fetch(`${apiBase(config)}/filemgr/addPathsByShareId`, {
      method: "POST",
      headers: jsonHeaders(config, cookie),
      body: JSON.stringify({ paths: [nasPath], share_id: config.shareId }),
      cache: "no-store",
    });
    const taskBody = await readJson<UgosResponse<{ result?: string }>>(taskRes);
    if (taskBody.code !== 200 || !taskBody.data?.result) {
      throw new Error(taskBody.msg || "NAS download task failed.");
    }
    const downloadUrl = new URL(`${apiBase(config)}/filemgr/shareDownloadFile`);
    downloadUrl.searchParams.set("coding", "true");
    downloadUrl.searchParams.set("share_id", config.shareId);
    downloadUrl.searchParams.set("password", config.password);
    downloadUrl.searchParams.set("task_id", taskBody.data.result);
    const headers: Record<string, string> = { ...(mediaHeaders(config, cookie) as Record<string, string>) };
    if (rangeHeader) headers.Range = rangeHeader;
    const res = await fetch(downloadUrl, { headers, cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json") || type.startsWith("text/") || (!res.ok && res.status !== 206)) {
      const body = await res.text();
      throw new Error(`NAS download failed: ${body.slice(0, 180)}`);
    }
    return res;
  });
}

async function downloadNasFileBytes(nasPath: string, filename: string, ext: string): Promise<Buffer> {
  return withNasDownloadRetries(async () => {
    const res = await openNasDownload(nasPath);
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeCache("files", nasPath, ext, bytes);
    return bytes;
  });
}

export async function nasCachedFileSize(nasPath: string, filename: string) {
  const ext = extensionFrom(filename, "bin");
  const hit = await cachedFile("files", nasPath, ext);
  if (!hit) return null;
  try {
    const info = await stat(/* turbopackIgnore: true */ hit);
    return info.size > 0 ? info.size : null;
  } catch {
    return null;
  }
}

export async function loadNasFileBytes(nasPath: string, filename: string) {
  const ext = extensionFrom(filename, "bin");
  const hit = await cachedFile("files", nasPath, ext);
  if (hit) return readFile(/* turbopackIgnore: true */ hit);
  return queueNasDownload(() => downloadNasFileBytes(nasPath, filename, ext));
}

const fileCacheInflight = new Map<string, Promise<string>>();

function limitedPrefixStream(body: ReadableStream<Uint8Array>, length: number) {
  const reader = body.getReader();
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent >= length) {
        controller.close();
        await reader.cancel().catch(() => undefined);
        return;
      }
      const { done, value } = await reader.read();
      if (done || !value) {
        controller.close();
        return;
      }
      const remaining = length - sent;
      if (value.byteLength <= remaining) {
        sent += value.byteLength;
        controller.enqueue(value);
        if (sent >= length) {
          controller.close();
          await reader.cancel().catch(() => undefined);
        }
        return;
      }
      controller.enqueue(value.subarray(0, remaining));
      sent += remaining;
      controller.close();
      await reader.cancel().catch(() => undefined);
    },
    cancel() {
      return reader.cancel().catch(() => undefined);
    },
  });
}

async function cacheDownloadBody(nasPath: string, ext: string, body: ReadableStream<Uint8Array>) {
  const finalPath = nasCacheFilePath("files", `${cacheKey(nasPath)}.${ext}`);
  const partPath = `${finalPath}.part`;
  await mkdir(/* turbopackIgnore: true */ nasCacheKindDir("files"), { recursive: true });
  try {
    await pipeline(
      Readable.fromWeb(body as import("stream/web").ReadableStream),
      createWriteStream(/* turbopackIgnore: true */ partPath),
    );
    await rename(/* turbopackIgnore: true */ partPath, /* turbopackIgnore: true */ finalPath);
  } catch (error) {
    await rm(/* turbopackIgnore: true */ partPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return finalPath;
}

function enqueueFileCache(nasPath: string, ext: string, body: ReadableStream<Uint8Array> | null) {
  const existing = fileCacheInflight.get(nasPath);
  if (existing) {
    if (body) void body.cancel().catch(() => undefined);
    return existing;
  }
  if (!body) return Promise.reject(new Error("NAS download was empty."));
  const job = cacheDownloadBody(nasPath, ext, body).finally(() => {
    fileCacheInflight.delete(nasPath);
  });
  fileCacheInflight.set(nasPath, job);
  return job;
}

function passthroughPartial(res: Response, filename: string, download: boolean) {
  const headers = openMediaHeaders(filename, download, null);
  headers["Accept-Ranges"] = "bytes";
  const length = res.headers.get("content-length");
  const contentRange = res.headers.get("content-range");
  if (length) headers["Content-Length"] = length;
  if (contentRange) headers["Content-Range"] = contentRange;
  return new Response(res.body, { status: 206, headers });
}

function streamWholeFile(
  body: ReadableStream<Uint8Array>,
  input: {
    nasPath: string;
    ext: string;
    status: 200 | 206;
    headers: Record<string, string>;
  },
) {
  if (fileCacheInflight.has(input.nasPath)) {
    return new Response(body, { status: input.status, headers: input.headers });
  }
  const [forClient, forCache] = body.tee();
  const job = cacheDownloadBody(input.nasPath, input.ext, forCache).finally(() => {
    fileCacheInflight.delete(input.nasPath);
  });
  fileCacheInflight.set(input.nasPath, job);
  job.catch((error) => {
    console.error("NAS file cache failed:", error);
  });
  return new Response(forClient, { status: input.status, headers: input.headers });
}

/**
 * In-app file bytes. Video playback sends `Range` (often `bytes=0-1` first).
 * A 200 of the entire buffered file never starts on Vercel and Safari will not
 * play it. Cached files answer 206. A miss streams from the NAS instead of
 * loading the whole video into memory first.
 */
export async function proxyNasFile(
  nasPath: string,
  filename: string,
  download = false,
  rangeHeader: string | null = null,
) {
  const ext = extensionFrom(filename, "bin");
  const options = { filename, download, rangeHeader };
  const hit = await cachedFile("files", nasPath, ext);
  if (hit) return mediaFileResponse(hit, options);

  const pending = fileCacheInflight.get(nasPath);
  if (pending) {
    try {
      return mediaFileResponse(await pending, options);
    } catch {
      /* The in-flight copy failed; open a new download below. */
    }
  }

  let upstream: Response | null = null;
  if (rangeHeader) {
    try {
      const ranged = await openNasDownload(nasPath, rangeHeader);
      if (ranged.status === 206 && ranged.headers.get("content-range") && ranged.body) {
        return passthroughPartial(ranged, filename, download);
      }
      const type = ranged.headers.get("content-type") ?? "";
      if (!type.includes("application/json") && !type.startsWith("text/") && ranged.ok && ranged.body) {
        upstream = ranged;
      } else {
        await ranged.body?.cancel().catch(() => undefined);
      }
    } catch {
      /* Share download ignored or rejected Range. Read the whole file next. */
    }
  }
  if (!upstream) upstream = await withNasDownloadRetries(() => openNasDownload(nasPath));
  if (!upstream.body) throw new Error("NAS download was empty.");

  const rawLength = upstream.headers.get("content-length")?.trim() ?? "";
  const declared = rawLength ? Number(rawLength) : Number.NaN;
  const size = Number.isFinite(declared) && declared >= 0 ? declared : null;
  if (size == null) {
    if (rangeHeader) {
      const cached = await enqueueFileCache(nasPath, ext, upstream.body);
      return mediaFileResponse(cached, options);
    }
    const headers = openMediaHeaders(filename, download, null);
    return streamWholeFile(upstream.body, { nasPath, ext, status: 200, headers });
  }

  const plan = planMediaResponse({ size, rangeHeader, filename, download });
  if (plan.kind === "unsatisfiable") {
    await upstream.body.cancel().catch(() => undefined);
    return new Response(null, { status: 416, headers: plan.headers });
  }

  const whole = plan.start === 0 && plan.end === size - 1;
  if (whole || plan.end < plan.start) {
    return streamWholeFile(upstream.body, {
      nasPath,
      ext,
      status: plan.status,
      headers: plan.headers,
    });
  }

  if (plan.start === 0) {
    return new Response(limitedPrefixStream(upstream.body, plan.end - plan.start + 1), {
      status: plan.status,
      headers: plan.headers,
    });
  }

  const cached = await enqueueFileCache(nasPath, ext, upstream.body);
  return mediaFileResponse(cached, options);
}
