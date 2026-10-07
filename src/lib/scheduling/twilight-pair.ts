import { overlaps, type Interval } from "./intervals";
import { bookingSlotMinutes, parseSchedulingServices, TWILIGHT_SERVICE, type SchedulingService } from "./services";
import {
  TWILIGHT_DAY_TAKEN,
  twilightConflictMessage,
  twilightDateKey,
  twilightDayValue,
} from "./twilight";

/** Shown when the daytime appointment and the sunset appointment run into each other. */
export const TWILIGHT_PAIR_OVERLAP =
  "Those times overlap. Pick a Twilight time that does not run into the other appointment.";

export const TWILIGHT_PAIR_INCOMPLETE = "Pick a time for the other services, then a Twilight time.";

/** Both rows are removed. The client can try again. */
export const TWILIGHT_PAIR_FAILED = "Those shoots could not be booked together. Nothing was saved.";

export type TwilightBookingFlow =
  | { kind: "standard"; services: SchedulingService[] }
  | { kind: "twilight"; services: SchedulingService[] }
  | { kind: "paired"; regular: SchedulingService[]; twilight: SchedulingService[] };

/**
 * Twilight alone uses the sunset picker. Twilight plus anything else is two
 * appointments. Anything without Twilight stays on the regular grid.
 */
export function twilightBookingFlow(services: readonly string[]): TwilightBookingFlow {
  const parsed = parseSchedulingServices(services);
  const regular = parsed.filter((service) => service !== TWILIGHT_SERVICE);
  const twilight = parsed.filter((service) => service === TWILIGHT_SERVICE);
  if (twilight.length === 0) return { kind: "standard", services: parsed };
  if (regular.length === 0) return { kind: "twilight", services: parsed };
  return { kind: "paired", regular, twilight };
}

/** Minutes for the non-Twilight appointment. Twilight's 30 minutes stay on its own booking. */
export function regularSlotMinutes(services: readonly string[], commercialHours?: number | null) {
  const flow = twilightBookingFlow(services);
  const regular = flow.kind === "paired" ? flow.regular : flow.services;
  return bookingSlotMinutes(regular, commercialHours);
}

export type TwilightSlotChoice = {
  start: string;
  end: string;
  dateKey: string;
};

/** Drop sunset slots that run into the appointment already chosen. */
export function twilightSlotsBeside<T extends TwilightSlotChoice>(
  regular: { start: string; end: string },
  slots: readonly T[],
): T[] {
  const window = { start: new Date(regular.start), end: new Date(regular.end) };
  if (Number.isNaN(window.start.getTime()) || Number.isNaN(window.end.getTime())) return [...slots];
  return slots.filter((slot) => {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return !overlaps(window, { start, end });
  });
}

/** The sunset slot on the daytime appointment's calendar day, when that day is still open. */
export function preferredTwilightSlot<T extends TwilightSlotChoice>(
  dateKey: string,
  slots: readonly T[],
): T | null {
  return slots.find((slot) => slot.dateKey === dateKey) ?? null;
}

export function intervalsOverlap(a: Interval, b: Interval) {
  return overlaps(a, b);
}

export type TwilightPairRow = {
  clientId: string;
  createdByUserId: string;
  address: string;
  services: string[];
  commercialVideoHours: number | null;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  accessCodes: string | null;
  driveSecondsFromPrior: number | null;
};

export type TwilightPairCalendarWrite = {
  address: string;
  start: Date;
  end: Date;
  timeZone: string;
  summary: string;
  description: string;
};

export type TwilightPairCommitInput = {
  regular: TwilightPairRow;
  twilight: TwilightPairRow;
  calendarConfigured: boolean;
  regularCalendar: TwilightPairCalendarWrite;
  twilightCalendar: TwilightPairCalendarWrite;
};

export type TwilightPairDeps = {
  insertBooking: (row: TwilightPairRow & { status: "confirmed"; calendarEventId: null; twilightDay: string | null }) => Promise<{ id: string } | null>;
  deleteBooking: (id: string) => Promise<void>;
  /** True when this Eastern day already has a confirmed Twilight. */
  twilightDayTaken: (dateKey: string) => Promise<boolean>;
  writeCalendar: (
    bookingId: string,
    write: TwilightPairCalendarWrite,
  ) => Promise<{ ok: true; eventId: string | null } | { ok: false }>;
  deleteCalendar: (eventId: string) => Promise<void>;
  saveCalendarId: (bookingId: string, eventId: string) => Promise<void>;
  sendPairEmail: (ids: { regularId: string; twilightId: string }) => Promise<{ emailFailed: boolean }>;
};

async function rollbackPair(
  deps: TwilightPairDeps,
  ids: readonly string[],
  eventIds: readonly string[],
) {
  for (const eventId of eventIds) {
    try {
      await deps.deleteCalendar(eventId);
    } catch (error) {
      console.error("twilight pair calendar rollback failed", error);
    }
  }
  for (const id of [...ids].reverse()) {
    try {
      await deps.deleteBooking(id);
    } catch (error) {
      console.error("twilight pair booking rollback failed", error);
    }
  }
}

/**
 * Insert the daytime booking and the Twilight booking together.
 * A failure after the first write deletes what was saved, including a Work
 * calendar event that already landed. Mail failure does not remove the rows.
 */
export async function commitTwilightPair(
  input: TwilightPairCommitInput,
  deps: TwilightPairDeps,
): Promise<
  | { ok: true; regularId: string; twilightId: string; emailFailed: boolean }
  | { ok: false; error: string }
> {
  const regularWindow = { start: input.regular.startsAt, end: input.regular.endsAt };
  const twilightWindow = { start: input.twilight.startsAt, end: input.twilight.endsAt };
  if (overlaps(regularWindow, twilightWindow)) {
    return { ok: false, error: TWILIGHT_PAIR_OVERLAP };
  }

  const dayKey = twilightDateKey(input.twilight.startsAt);
  if (await deps.twilightDayTaken(dayKey)) {
    return { ok: false, error: TWILIGHT_DAY_TAKEN };
  }

  const regular = await deps.insertBooking({
    ...input.regular,
    status: "confirmed",
    calendarEventId: null,
    twilightDay: twilightDayValue(input.regular.services, input.regular.startsAt),
  });
  if (!regular) return { ok: false, error: TWILIGHT_PAIR_FAILED };

  let twilight: { id: string } | null = null;
  try {
    twilight = await deps.insertBooking({
      ...input.twilight,
      status: "confirmed",
      calendarEventId: null,
      twilightDay: twilightDayValue(input.twilight.services, input.twilight.startsAt),
    });
  } catch (error) {
    await rollbackPair(deps, [regular.id], []);
    return { ok: false, error: twilightConflictMessage(error) ?? TWILIGHT_PAIR_FAILED };
  }
  if (!twilight) {
    await rollbackPair(deps, [regular.id], []);
    return { ok: false, error: TWILIGHT_PAIR_FAILED };
  }

  const savedIds = [regular.id, twilight.id];
  const savedEvents: string[] = [];
  if (input.calendarConfigured) {
    const first = await deps.writeCalendar(regular.id, input.regularCalendar);
    if (!first.ok) {
      await rollbackPair(deps, savedIds, savedEvents);
      return { ok: false, error: TWILIGHT_PAIR_FAILED };
    }
    if (first.eventId) savedEvents.push(first.eventId);
    const second = await deps.writeCalendar(twilight.id, input.twilightCalendar);
    if (!second.ok) {
      await rollbackPair(deps, savedIds, savedEvents);
      return { ok: false, error: TWILIGHT_PAIR_FAILED };
    }
    if (first.eventId) await deps.saveCalendarId(regular.id, first.eventId);
    if (second.eventId) await deps.saveCalendarId(twilight.id, second.eventId);
  }

  let emailFailed = false;
  try {
    const sent = await deps.sendPairEmail({ regularId: regular.id, twilightId: twilight.id });
    emailFailed = sent.emailFailed;
  } catch (error) {
    console.error("twilight pair confirmation email failed", error);
    emailFailed = true;
  }

  return { ok: true, regularId: regular.id, twilightId: twilight.id, emailFailed };
}
