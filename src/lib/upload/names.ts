/** Exact directory name on the share. Case-sensitive — `Upload` is a different folder. */
export const NAS_UPLOAD_DIR_NAME = "upload";

const MAX_LABEL = 80;
const MAX_FOLDER = 180;
const MAX_FILE_NAME = 180;

function cleanSegment(raw: string | null | undefined) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeUploadName(
  raw: string | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = cleanSegment(raw);
  if (!cleaned) return { ok: false, error: "Enter your name." };
  if (cleaned.length > MAX_LABEL) return { ok: false, error: "Keep it shorter." };
  return { ok: true, value: cleaned };
}

export function sanitizeUploadLabel(
  raw: string | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = cleanSegment(raw);
  if (!cleaned) return { ok: false, error: "Enter what you are uploading." };
  if (cleaned.length > MAX_LABEL) return { ok: false, error: "Keep it shorter." };
  return { ok: true, value: cleaned };
}

/** One path segment. Drops directories, control characters, and leading dots. */
export function sanitizeFileName(raw: string | null | undefined) {
  const base = String(raw ?? "").split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/g, "");
  const name = cleaned.slice(0, MAX_FILE_NAME);
  if (!name || name === "." || name === "..") return "file";
  return name;
}

export function uniqueFileName(name: string, taken: Iterable<string>) {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}

/** `<what they're uploading> - <name>`. Email stays out of the folder. */
export function submissionFolderBase(input: { label: string; name: string }) {
  const suffix = ` - ${input.name}`;
  const room = Math.max(1, MAX_FOLDER - suffix.length);
  return `${input.label.slice(0, room)}${suffix}`;
}

/** Never overwrite. The second folder is `name-2`, then `name-3`. */
export function uniqueFolderName(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function uploadBlobPath(submissionId: string, fileId: string, safeName: string) {
  return `uploads/${submissionId}/${fileId}/${safeName}`;
}

export function findUploadDirectory(
  entries: Array<{ name: string; path: string; isDir: boolean }>,
) {
  return entries.find((entry) => entry.isDir && entry.name === NAS_UPLOAD_DIR_NAME) ?? null;
}
