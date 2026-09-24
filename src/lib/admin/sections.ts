/** Open admin modules. Stored in a cookie so a reload keeps the choice and the URL stays clean. */
export const ADMIN_SECTIONS_COOKIE = "bk_admin_sections";

const YEAR_SECONDS = 60 * 60 * 24 * 365;
const SECTION_ID = /^[a-z0-9:-]{1,40}$/;

export function parseOpenSections(value: string | null | undefined): ReadonlySet<string> {
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

export function serializeOpenSections(ids: Iterable<string>) {
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

export function adminSectionsCookie(value: string, secure = false) {
  if (!value) {
    return `${ADMIN_SECTIONS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  const parts = [
    `${ADMIN_SECTIONS_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Collapsed unless Billy opened it before, or this visit has a result that must stay visible. */
export function sectionStartsOpen(stored: ReadonlySet<string>, id: string, forceOpen: boolean) {
  return forceOpen || stored.has(id);
}

export function clientsSectionForce(
  id: string,
  input: {
    query: string;
    sortIsDefault: boolean;
    minted: boolean;
    synced: boolean;
    error: boolean;
  },
) {
  if (id === "clients:nas-sync") return input.synced || (input.error && !input.minted);
  if (id === "clients:create-client") return input.minted || (input.error && !input.synced);
  if (id === "clients:all") return input.query.trim().length > 0 || !input.sortIsDefault;
  return false;
}

export function bookingsSectionForce(id: string, input: { notice: boolean }) {
  return id === "bookings:upcoming" && input.notice;
}

export function clientDetailSectionForce(
  id: string,
  input: { saved: boolean; userRemoved: boolean; bookingCancelled: boolean; error: string },
) {
  const error = input.error.trim();
  const deleteError = /delete/i.test(error);
  const userError = /\buser\b/i.test(error);
  if (id === "client:info") return input.saved || (error.length > 0 && !deleteError && !userError);
  if (id === "client:logins") return input.userRemoved || userError;
  if (id === "client:bookings") return input.bookingCancelled;
  if (id === "client:delete") return deleteError;
  return false;
}
