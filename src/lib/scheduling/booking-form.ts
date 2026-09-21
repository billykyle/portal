/** Read the chosen Book shoot slot from form fields (hidden + radios). */

export type ParsedBookingSlot = {
  startIso: string;
  endIso: string;
};

function flattenSlotInputs(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw) || raw instanceof Set) {
    return [...raw].flatMap((item) => flattenSlotInputs(item));
  }
  if (typeof raw === "string") return [raw];
  return [];
}

/** First `start|end` pair with two valid datetimes. Ignores empty hidden fields. */
export function parseBookingSlot(raw: unknown): ParsedBookingSlot | null {
  for (const value of flattenSlotInputs(raw)) {
    const sep = value.indexOf("|");
    if (sep <= 0) continue;
    const startIso = value.slice(0, sep).trim();
    const endIso = value.slice(sep + 1).trim();
    if (!startIso || !endIso) continue;
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    return { startIso, endIso };
  }
  return null;
}

export function readBookingFormSlot(formData: FormData): ParsedBookingSlot | null {
  return parseBookingSlot(formData.getAll("slot"));
}

/** Tap an already-selected time to clear it; tap another time to select it. */
export function toggleSelectedSlot(current: string, tapped: string) {
  return current === tapped ? "" : tapped;
}

export function bookingUserError(error: unknown, fallback = "Booking could not be completed.") {
  const message = error instanceof Error ? error.message.trim() : "";
  const text = message || fallback;
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}
