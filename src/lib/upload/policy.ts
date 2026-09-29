import { parseLoginEmail } from "@/lib/signup-fields";
import { sanitizeFileName, sanitizeUploadLabel, sanitizeUploadName, uniqueFileName } from "@/lib/upload/names";

type Bucket = { count: number; resetAt: number };

type GlobalRate = typeof globalThis & { __portalUploadRate?: Map<string, Bucket> };

function buckets() {
  const g = globalThis as GlobalRate;
  if (!g.__portalUploadRate) g.__portalUploadRate = new Map();
  return g.__portalUploadRate;
}

/** Submissions per address per hour. A person can send a few batches; a script cannot. */
export const UPLOAD_RATE_LIMIT = 10;
export const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000;

export const DEFAULT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024 * 1024;
export const DEFAULT_UPLOAD_MAX_FILES = 50;
export const DEFAULT_UPLOAD_MAX_TOTAL_BYTES = 200 * 1024 * 1024 * 1024;

export function resetUploadRateForTests() {
  buckets().clear();
}

export function consumeUploadRate(
  key: string,
  now = Date.now(),
  limit = UPLOAD_RATE_LIMIT,
  windowMs = UPLOAD_RATE_WINDOW_MS,
) {
  const map = buckets();
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, retryAfterSec: 0 };
  }
  current.count += 1;
  if (current.count > limit) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  return { ok: true as const, retryAfterSec: 0 };
}

export function uploadClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function positiveLimit(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) return value;
  return fallback;
}

export function uploadLimits() {
  return {
    maxBytes: positiveLimit(process.env.UPLOAD_MAX_BYTES, DEFAULT_UPLOAD_MAX_BYTES),
    maxFiles: positiveLimit(process.env.UPLOAD_MAX_FILES, DEFAULT_UPLOAD_MAX_FILES),
    maxTotalBytes: positiveLimit(process.env.UPLOAD_MAX_TOTAL_BYTES, DEFAULT_UPLOAD_MAX_TOTAL_BYTES),
  };
}

export function blobTokenConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export type UploadRequestFile = {
  name: string;
  safeName: string;
  size: number;
};

export function parseUploadRequest(
  body: unknown,
  limits = uploadLimits(),
):
  | { ok: true; name: string; label: string; email: string; files: UploadRequestFile[] }
  | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") return { ok: false, error: "Enter your name.", status: 400 };
  const record = body as { name?: unknown; label?: unknown; email?: unknown; files?: unknown };
  const name = sanitizeUploadName(typeof record.name === "string" ? record.name : "");
  if (!name.ok) return { ok: false, error: name.error, status: 400 };
  const email = parseLoginEmail(typeof record.email === "string" ? record.email : "");
  if (!email.ok) return { ok: false, error: email.error, status: 400 };
  const label = sanitizeUploadLabel(typeof record.label === "string" ? record.label : "");
  if (!label.ok) return { ok: false, error: label.error, status: 400 };
  if (!Array.isArray(record.files) || record.files.length === 0) {
    return { ok: false, error: "Choose a file.", status: 400 };
  }
  if (record.files.length > limits.maxFiles) {
    return { ok: false, error: "Too many files.", status: 400 };
  }
  const files: UploadRequestFile[] = [];
  let total = 0;
  const taken = new Set<string>();
  for (const entry of record.files) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Choose a file.", status: 400 };
    const item = entry as { name?: unknown; size?: unknown };
    const size = item.size;
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      return { ok: false, error: "Choose a file.", status: 400 };
    }
    if (size > limits.maxBytes) return { ok: false, error: "That file is too large.", status: 400 };
    total += size;
    if (total > limits.maxTotalBytes) return { ok: false, error: "That file is too large.", status: 400 };
    const safeName = uniqueFileName(sanitizeFileName(typeof item.name === "string" ? item.name : ""), taken);
    taken.add(safeName);
    files.push({
      name: typeof item.name === "string" ? item.name : safeName,
      safeName,
      size,
    });
  }
  return { ok: true, name: name.value, label: label.value, email: email.value, files };
}
