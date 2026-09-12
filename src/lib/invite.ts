export const INVITE_PATTERN = /^BK\d{5}$/;

export function normalizeInviteCode(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function isInviteCode(value: string) {
  return INVITE_PATTERN.test(value);
}

export function formatInviteCode(sequence: number) {
  return `BK${String(sequence).padStart(5, "0")}`;
}

export function parseInviteSequence(code: string) {
  if (!isInviteCode(code)) return null;
  return Number.parseInt(code.slice(2), 10);
}
