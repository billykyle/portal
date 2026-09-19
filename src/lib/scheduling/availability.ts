import { parseShootAddress } from "./address";
import { availabilityWindow, fetchCalendarBusy, fetchCalendarJobs } from "./calendar";
import { schedulingHours, schedulingIntegrations } from "./config";
import { measureDriveSeconds } from "./drive-time";
import { mergeIntervals, overlaps, type Interval } from "./intervals";
import { formatSlotRange, generateCandidateSlots } from "./slots";
import { pickNextJob, pickPriorJob, travelFits, type TravelJob } from "./travel";

export type OfferedSlot = {
  start: string;
  end: string;
  dateLabel: string;
  timeLabel: string;
  driveSecondsFromPrior: number | null;
};

export type AvailabilityResult = {
  address: string;
  timeZone: string;
  calendarConfigured: boolean;
  driveTimeConfigured: boolean;
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

export async function offerSlotsForAddress(
  rawAddress: string,
  sources: AvailabilitySources,
): Promise<AvailabilityResult> {
  const parsed = parseShootAddress(rawAddress);
  const hours = schedulingHours();
  const now = sources.now ?? new Date();
  const notices: string[] = [];

  if (!parsed.ok) {
    return {
      address: "",
      timeZone: hours.timeZone,
      calendarConfigured: sources.calendarConfigured,
      driveTimeConfigured: sources.driveTimeConfigured,
      slots: [],
      notices,
      error: parsed.error,
    };
  }

  const candidates = generateCandidateSlots({ ...hours, now });
  const busy = mergeIntervals(sources.busy);
  const afterBusy = candidates.filter((slot) => !busy.some((block) => overlaps(slot, block)));

  const pairKey = (from: string, to: string) => `${from}\n${to}`;
  const needed = new Map<string, { from: string; to: string; departAt: Date }>();
  for (const slot of afterBusy) {
    const prior = pickPriorJob(sources.jobs, slot.start);
    const next = pickNextJob(sources.jobs, slot.end);
    if (prior?.address) {
      needed.set(pairKey(prior.address, parsed.address), {
        from: prior.address,
        to: parsed.address,
        departAt: prior.end,
      });
    }
    if (next?.address) {
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
    const prior = pickPriorJob(sources.jobs, slot.start);
    const next = pickNextJob(sources.jobs, slot.end);
    const verdict = travelFits({
      slot,
      newAddress: parsed.address,
      prior,
      next,
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
    notices.push(
      "Some times next to another job are hidden until live drive time is available (GOOGLE_MAPS_API_KEY). Geography is never guessed.",
    );
  } else if (sources.driveTimeConfigured && hiddenForTravel > 0 && slots.length === 0) {
    notices.push("No remaining times fit travel from the prior job plus the 15-minute pad.");
  }

  return {
    address: parsed.address,
    timeZone: hours.timeZone,
    calendarConfigured: sources.calendarConfigured,
    driveTimeConfigured: sources.driveTimeConfigured,
    slots,
    notices,
  };
}

export function slotStillOffered(result: AvailabilityResult, startIso: string, endIso: string) {
  return result.slots.some((slot) => slot.start === startIso && slot.end === endIso);
}

export async function loadLiveAvailabilitySources(options: {
  portalBusy: Interval[];
  portalJobs: TravelJob[];
  now?: Date;
}): Promise<AvailabilitySources | { error: string }> {
  const hours = schedulingHours();
  const integrations = schedulingIntegrations();
  const now = options.now ?? new Date();
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
      const message = error instanceof Error ? error.message : "Google Calendar is unavailable.";
      return { error: message };
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
