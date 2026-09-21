import { parseShootAddress } from "./address";
import { availabilityWindow, fetchCalendarBusy, fetchCalendarJobs } from "./calendar";
import { schedulingIntegrations } from "./config";
import { measureDriveSeconds } from "./drive-time";
import {
  calendarDateKey,
  firstBookableDate,
  hoursForNow,
  lastBookableDate,
} from "./horizon";
import { mergeIntervals, overlaps, sameInterval, subtractInterval, type Interval } from "./intervals";
import { bookingSlotMinutes, parseSchedulingServices } from "./services";
import { formatSlotRange, generateCandidateSlots } from "./slots";
import {
  pickNextJobs,
  pickPriorJobs,
  travelFits,
  travelJobsWithBusy,
  type TravelJob,
} from "./travel";

export type OfferedSlot = {
  start: string;
  end: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  driveSecondsFromPrior: number | null;
};

export type AvailabilityResult = {
  address: string;
  timeZone: string;
  calendarConfigured: boolean;
  driveTimeConfigured: boolean;
  firstBookableDate: string;
  lastBookableDate: string;
  slots: OfferedSlot[];
  notices: string[];
  error?: string;
};

export type AvailabilitySources = {
  now?: Date;
  busy: Interval[];
  jobs: TravelJob[];
  driveSeconds: (from: string, to: string, departAt: Date) => Promise<number | null>;
  calendarConfigured: boolean;
  driveTimeConfigured: boolean;
};

export function withoutOwnBooking(
  sources: AvailabilitySources,
  window: Interval,
  options?: { calendarEventId?: string | null },
): AvailabilitySources {
  const eventId = options?.calendarEventId?.trim() || "";
  const ownJobs = sources.jobs.filter(
    (job) => sameInterval(job, window) || (eventId !== "" && job.eventId === eventId),
  );
  let busy = subtractInterval(sources.busy, window);
  for (const job of ownJobs) {
    busy = subtractInterval(busy, job);
  }
  return {
    ...sources,
    busy,
    jobs: sources.jobs.filter((job) => !ownJobs.includes(job)),
  };
}

export async function offerSlotsForAddress(
  rawAddress: string,
  sources: AvailabilitySources,
  services: readonly string[] = [],
  options?: { retainStarts?: readonly Date[] },
): Promise<AvailabilityResult> {
  const parsed = parseShootAddress(rawAddress);
  const now = sources.now ?? new Date();
  const selected = parseSchedulingServices(services);
  const hours = hoursForNow(
    now,
    selected.length > 0 ? bookingSlotMinutes(selected) : undefined,
  );
  const notices: string[] = [];
  const window = {
    firstBookableDate: calendarDateKey(firstBookableDate(now, hours)),
    lastBookableDate: calendarDateKey(lastBookableDate(now, hours.timeZone)),
  };

  if (!parsed.ok) {
    return {
      address: "",
      timeZone: hours.timeZone,
      calendarConfigured: sources.calendarConfigured,
      driveTimeConfigured: sources.driveTimeConfigured,
      ...window,
      slots: [],
      notices,
      error: parsed.error,
    };
  }

  const candidates = generateCandidateSlots({
    ...hours,
    now,
    retainStarts: options?.retainStarts,
  });
  const busy = mergeIntervals(sources.busy);
  const afterBusy = candidates.filter((slot) => !busy.some((block) => overlaps(slot, block)));
  const neighborJobs = travelJobsWithBusy(sources.jobs, busy);

  const pairKey = (from: string, to: string) => `${from}\n${to}`;
  const needed = new Map<string, { from: string; to: string; departAt: Date }>();
  for (const slot of afterBusy) {
    const priors = pickPriorJobs(neighborJobs, slot.start);
    const nexts = pickNextJobs(neighborJobs, slot.end);
    for (const prior of priors) {
      if (!prior.address) continue;
      needed.set(pairKey(prior.address, parsed.address), {
        from: prior.address,
        to: parsed.address,
        departAt: prior.end,
      });
    }
    for (const next of nexts) {
      if (!next.address) continue;
      needed.set(pairKey(parsed.address, next.address), {
        from: parsed.address,
        to: next.address,
        departAt: slot.end,
      });
    }
  }

  const measured = new Map<string, number | null>();
  for (const [key, pair] of needed) {
    measured.set(key, await sources.driveSeconds(pair.from, pair.to, pair.departAt));
  }

  const slots: OfferedSlot[] = [];
  let hiddenForTravel = 0;
  for (const slot of afterBusy) {
    const priors = pickPriorJobs(neighborJobs, slot.start);
    const nexts = pickNextJobs(neighborJobs, slot.end);
    const verdict = travelFits({
      slot,
      newAddress: parsed.address,
      prior: priors,
      next: nexts,
      driveSeconds: (from, to) => {
        const value = measured.get(pairKey(from, to));
        return value === undefined ? null : value;
      },
    });
    if (!verdict.ok) {
      hiddenForTravel += 1;
      continue;
    }
    const labels = formatSlotRange(slot.start, slot.end, hours.timeZone);
    slots.push({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      dateKey: labels.dateKey,
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
      driveSecondsFromPrior: verdict.driveSecondsFromPrior,
    });
  }

  if (!sources.calendarConfigured) {
    notices.push(
      "Google Calendar is not connected yet. These times only avoid shoots already booked in this portal.",
    );
  }
  if (!sources.driveTimeConfigured && hiddenForTravel > 0) {
    notices.push("Some times next to another job are hidden until live drive time is available.");
  } else if (sources.driveTimeConfigured && hiddenForTravel > 0 && slots.length === 0) {
    notices.push("No remaining times fit live drive time from the prior or to the next job.");
  }

  return {
    address: parsed.address,
    timeZone: hours.timeZone,
    calendarConfigured: sources.calendarConfigured,
    driveTimeConfigured: sources.driveTimeConfigured,
    ...window,
    slots: keepRetainedStarts(slots, options?.retainStarts, hours.slotMinutes, hours.timeZone),
    notices,
  };
}

/** Modify: always offer the original start, even if a longer duration overlaps other busy time. */
export function keepRetainedStarts(
  slots: OfferedSlot[],
  retainStarts: readonly Date[] | undefined,
  slotMinutes: number,
  timeZone: string,
): OfferedSlot[] {
  if (!retainStarts?.length) return slots;
  const existing = new Set(slots.map((slot) => new Date(slot.start).getTime()));
  const extra: OfferedSlot[] = [];
  for (const start of retainStarts) {
    if (existing.has(start.getTime())) continue;
    const end = new Date(start.getTime() + Math.max(5, slotMinutes) * 60 * 1000);
    const labels = formatSlotRange(start, end, timeZone);
    extra.push({
      start: start.toISOString(),
      end: end.toISOString(),
      dateKey: labels.dateKey,
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
      driveSecondsFromPrior: null,
    });
  }
  if (extra.length === 0) return slots;
  return [...slots, ...extra].sort((a, b) => a.start.localeCompare(b.start));
}

export function slotStillOffered(result: AvailabilityResult, startIso: string, endIso: string) {
  return result.slots.some((slot) => slot.start === startIso && slot.end === endIso);
}

/** Keep STS / OIDC internals off the scheduling times page. */
export function publicCalendarError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Google Calendar is unavailable.";
  if (/invalid_grant|expected audience|workloadIdentityPools|oidc|sts\.googleapis/i.test(message)) {
    return "Google Calendar authentication failed.";
  }
  return message;
}

export async function loadLiveAvailabilitySources(options: {
  portalBusy: Interval[];
  portalJobs: TravelJob[];
  now?: Date;
}): Promise<AvailabilitySources | { error: string }> {
  const now = options.now ?? new Date();
  const hours = hoursForNow(now);
  const integrations = schedulingIntegrations();
  const range = availabilityWindow(now, hours.daysAhead, hours.timeZone);
  const busy = [...options.portalBusy];
  const jobs = [...options.portalJobs];

  if (integrations.calendarConfigured) {
    try {
      const [calendarBusy, calendarJobs] = await Promise.all([
        fetchCalendarBusy(range, hours.timeZone),
        fetchCalendarJobs(range, hours.timeZone),
      ]);
      busy.push(...calendarBusy);
      jobs.push(...calendarJobs);
    } catch (error) {
      console.error("Google Calendar availability lookup failed", error);
      return { error: publicCalendarError(error) };
    }
  }

  return {
    now,
    busy,
    jobs,
    calendarConfigured: integrations.calendarConfigured,
    driveTimeConfigured: integrations.driveTimeConfigured,
    driveSeconds: measureDriveSeconds,
  };
}
