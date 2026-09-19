export function normalizeAddress(address: string) {
  return address
    .trim()
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(usa|united states|u s a|u s)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameAddress(a: string, b: string) {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  return Boolean(left) && left === right;
}

export type ParsedAddress =
  | { ok: true; address: string }
  | { ok: false; error: string };

/** Address-first gate. Times must not be computed until this succeeds. */
export function parseShootAddress(raw: string | null | undefined): ParsedAddress {
  const address = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!address) {
    return { ok: false, error: "Enter the shoot address first." };
  }
  if (address.length < 8 || !/\d/.test(address) || !/[a-zA-Z]/.test(address)) {
    return { ok: false, error: "Enter a full street address (number and street)." };
  }
  return { ok: true, address };
}
