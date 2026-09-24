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

type SlotRange = { start: string; end: string };

function slotValue(slot: SlotRange) {
  return `${slot.start}|${slot.end}`;
}

function slotStart(value: string) {
  const sep = value.indexOf("|");
  return sep > 0 ? value.slice(0, sep) : "";
}

/**
 * Keep a selection that is still offered. When the offered end changes (extra
 * services) or the visible slots were for a different query, follow the same
 * start, then the booking's current start.
 */
export function resolveSelectedSlot(
  current: string,
  slots: readonly SlotRange[],
  currentSlot?: string,
) {
  if (current && slots.some((slot) => slotValue(slot) === current)) return current;
  if (current) {
    const start = slotStart(current);
    const bySelectionStart = start ? slots.find((slot) => slot.start === start) : undefined;
    if (bySelectionStart) return slotValue(bySelectionStart);
  }
  if (!currentSlot) return "";
  const exact = slots.find((slot) => slotValue(slot) === currentSlot);
  if (exact) return slotValue(exact);
  const start = slotStart(currentSlot);
  const byCurrentStart = start ? slots.find((slot) => slot.start === start) : undefined;
  return byCurrentStart ? slotValue(byCurrentStart) : "";
}

/**
 * Exact start+end wins. `endIso` null matches by start (agent partial updates).
 * A stale end still saves the single offered slot for that start — duration
 * belongs to the services, not the previously rendered radio.
 */
export function offeredSlotForSubmission<T extends SlotRange>(
  slots: readonly T[],
  startIso: string,
  endIso: string | null,
): T | undefined {
  if (endIso) {
    const exact = slots.find((slot) => slot.start === startIso && slot.end === endIso);
    if (exact) return exact;
  }
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) return undefined;
  const endMs = endIso ? Date.parse(endIso) : null;
  if (endIso && (endMs == null || Number.isNaN(endMs))) return undefined;
  const byInstant = slots.find((slot) => {
    if (Date.parse(slot.start) !== startMs) return false;
    if (endMs == null) return true;
    return Date.parse(slot.end) === endMs;
  });
  if (byInstant) return byInstant;
  const sameStart = slots.filter((slot) => slot.start === startIso || Date.parse(slot.start) === startMs);
  return sameStart.length === 1 ? sameStart[0] : undefined;
}

export function bookingUserError(error: unknown, fallback = "Booking could not be completed.") {
  const message = error instanceof Error ? error.message.trim() : "";
  const text = message || fallback;
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}
