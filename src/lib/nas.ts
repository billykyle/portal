import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";

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
const FILE_TYPE_DIR = 1;

let cachedCookie: string | null = null;
let cookieInFlight: Promise<string> | null = null;
let resolvedHost: string | null = null;

export function nasEnabled() {
  return process.env.NAS_ENABLED === "true";
}

export function isNasFilePath(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith("/"));
}

function parseShareIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get("id")?.trim() || "";
  } catch {
    return "";
  }
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
    cacheDir: process.env.NAS_CACHE_DIR?.trim() || path.join(process.cwd(), ".nas-cache"),
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
    const match = entry.match(/^(share_cookie_[^=]+)=([^;]+)/);
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
  const body = await readJson<
    UgosResponse<{ file_info?: Array<{ path: string; name: string; file_type: number }> }>
  >(res);
  if (body.code !== 200) {
    throw new Error(body.msg || "NAS share verify failed.");
  }
  const cookie = cookieFromResponse(res);
  if (!cookie) {
    throw new Error("NAS share did not set a share cookie.");
  }
  cachedCookie = cookie;
  return { config: live, cookie, rootPath: body.data?.file_info?.[0]?.path ?? "" };
}

async function withCookie<T>(fn: (config: NasConfig, cookie: string) => Promise<T>): Promise<T> {
  const base = getNasConfig();
  if (!base) throw new Error("NAS share is not configured.");
  const run = async (force: boolean) => {
    if (force) cachedCookie = null;
    if (!cachedCookie) {
      cookieInFlight ??= verifyShare(base)
        .then((result) => result.cookie)
        .finally(() => {
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
  } catch {
    cachedCookie = null;
    return run(true);
  }
}

export async function nasShareRoot() {
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

export async function findStillsFolder(shootFolderPath: string) {
  const config = getNasConfig();
  if (!config) throw new Error("NAS share is not configured.");
  const entries = await listNasDir(shootFolderPath);
  const dirs = entries.filter((entry) => entry.fileType === FILE_TYPE_DIR);
  const wanted = config.stillsFolders.map((name) => name.toLowerCase());
  const match = dirs.find((dir) => wanted.includes(dir.name.toLowerCase()));
  if (!match) {
    const names = dirs.map((dir) => dir.name).join(", ") || "none";
    throw new Error(
      `No ${config.stillsFolders.join(" or ")} folder under ${shootFolderPath}. Found: ${names}.`,
    );
  }
  return match;
}

const STILL_EXT = /\.(jpe?g|png|webp|heic|tif|tiff)$/i;

export async function listNasStills(shootFolderPath: string) {
  const stills = await findStillsFolder(shootFolderPath);
  const files = await listNasDir(stills.path);
  return files.filter((file) => file.fileType !== FILE_TYPE_DIR && STILL_EXT.test(file.name));
}

function cacheKey(nasPath: string) {
  return createHash("sha256").update(nasPath).digest("hex").slice(0, 32);
}

async function cachedFile(kind: "thumbs" | "files", nasPath: string, ext: string) {
  const config = getNasConfig();
  if (!config) return null;
  const filePath = path.join(config.cacheDir, kind, `${cacheKey(nasPath)}.${ext}`);
  try {
    const info = await stat(filePath);
    if (info.size > 0) return filePath;
  } catch {
    /* miss */
  }
  return null;
}

async function writeCache(kind: "thumbs" | "files", nasPath: string, ext: string, bytes: Buffer) {
  const config = getNasConfig();
  if (!config) return;
  const filePath = path.join(config.cacheDir, kind, `${cacheKey(nasPath)}.${ext}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
  return filePath;
}

function extensionFrom(name: string, fallback: string) {
  const ext = path.extname(name).replace(".", "").toLowerCase();
  return ext || fallback;
}

function nodeStreamResponse(filePath: string, contentType: string, filename: string, download: boolean) {
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function proxyNasThumbnail(nasPath: string, filename: string) {
  const hit = await cachedFile("thumbs", nasPath, "jpg");
  if (hit) return nodeStreamResponse(hit, "image/jpeg", filename, false);

  return withCookie(async (config, cookie) => {
    const url = new URL(`${apiBase(config)}/filemgr/shareThumbnail`);
    url.searchParams.set("path", nasPath);
    url.searchParams.set("type", "1");
    url.searchParams.set("size_type", "3");
    const res = await fetch(url, { headers: mediaHeaders(config, cookie), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json") || !res.ok) {
      const body = await res.text();
      throw new Error(`NAS thumbnail failed: ${body.slice(0, 180)}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeCache("thumbs", nasPath, "jpg", bytes);
    return new Response(bytes, {
      headers: {
        "Content-Type": type.includes("image/") ? type : "image/jpeg",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  });
}

export async function proxyNasFile(nasPath: string, filename: string, download = false) {
  const ext = extensionFrom(filename, "bin");
  const hit = await cachedFile("files", nasPath, ext);
  if (hit) {
    return nodeStreamResponse(hit, ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream", filename, download);
  }

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
    const res = await fetch(downloadUrl, { headers: mediaHeaders(config, cookie), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json") || !res.ok) {
      const body = await res.text();
      throw new Error(`NAS download failed: ${body.slice(0, 180)}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeCache("files", nasPath, ext, bytes);
    return new Response(bytes, {
      headers: {
        "Content-Type": type.includes("image/") ? type : "image/jpeg",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  });
}
