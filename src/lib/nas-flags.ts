/** Lightweight NAS flags — no fs/path, safe for any server module graph. */

export function nasEnabled() {
  return process.env.NAS_ENABLED === "true";
}

export function isNasFilePath(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith("/"));
}
