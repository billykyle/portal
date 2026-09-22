import { normalizeEmail } from "@/lib/email";

/**
 * Practical address: local part, a domain label, and a dotted TLD.
 * Rejects `a@b`, spaces, and double dots. Not a full RFC parser.
 */
const NOTE_EMAIL =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

export function isNoteEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || email.includes("..")) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
    email,
  );
}

/** Emails typed in Notes. Invalid matches dropped. `exclude` (the booker) is not copied. */
export function emailsInNotes(
  notes: string | null | undefined,
  exclude: Array<string | null | undefined> = [],
) {
  const blocked = new Set(exclude.map((value) => normalizeEmail(value)).filter(Boolean));
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(NOTE_EMAIL.source, "gi");
  for (const match of String(notes ?? "").matchAll(pattern)) {
    const email = normalizeEmail(match[0]);
    if (!email || seen.has(email) || blocked.has(email) || !isNoteEmail(email)) continue;
    seen.add(email);
    found.push(email);
  }
  return found;
}
