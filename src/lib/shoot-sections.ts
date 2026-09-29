/** Closed shoot deliverable sections. Missing means open. One choice per section type. */
export const SHOOT_SECTIONS_COOKIE = "bk_shoot_sections";

const YEAR_SECONDS = 60 * 60 * 24 * 365;
const SECTION_ID = /^[a-z0-9:-]{1,40}$/;

export function parseClosedShootSections(value: string | null | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const ids = new Set<string>();
  for (const part of decoded.split(",")) {
    const id = part.trim();
    if (SECTION_ID.test(id)) ids.add(id);
  }
  return ids;
}

export function serializeClosedShootSections(ids: Iterable<string>) {
  return [...ids]
    .map((id) => id.trim())
    .filter((id) => SECTION_ID.test(id))
    .sort()
    .join(",");
}

export function readCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

/** One year, path-wide cookie. An empty value clears it. */
export function preferenceCookie(name: string, value: string, secure = false) {
  if (!value) {
    return `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function shootSectionsCookie(value: string, secure = false) {
  return preferenceCookie(SHOOT_SECTIONS_COOKIE, value, secure);
}

export function shootSectionStartsOpen(closed: ReadonlySet<string>, id: string) {
  return !closed.has(id);
}
