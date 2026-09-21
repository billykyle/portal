import { sameAddress } from "./address";
import { calendarDateKey } from "./horizon";
import { STACK_STRONG_DRIVE_SECONDS } from "./rules";
import type { TravelJob } from "./travel";
import { utcToZonedParts } from "./zoned-time";

export type StackableSlot = {
  start: string;
  end: string;
  dateKey: string;
  stackDriveSeconds?: number | null;
};

export function jobDateKey(job: Pick<TravelJob, "start">, timeZone: string) {
  return calendarDateKey(utcToZonedParts(job.start, timeZone));
}

export function locatedJobsOnDate(jobs: readonly TravelJob[], dateKey: string, timeZone: string) {
  return jobs.filter((job) => job.address && jobDateKey(job, timeZone) === dateKey);
}

/** Latest-ending same-day located jobs that finish at or before the slot. */
export function pickSameDayLocatedPriors(
  jobs: readonly TravelJob[],
  slotStart: Date,
  dateKey: string,
  timeZone: string,
): TravelJob[] {
  const located = locatedJobsOnDate(jobs, dateKey, timeZone).filter(
    (job) => job.end.getTime() <= slotStart.getTime(),
  );
  let latestEnd: number | null = null;
  for (const job of located) {
    if (latestEnd == null || job.end.getTime() > latestEnd) latestEnd = job.end.getTime();
  }
  if (latestEnd == null) return [];
  return located.filter((job) => job.end.getTime() === latestEnd);
}

/** Earliest-starting same-day located jobs that begin at or after the slot. */
export function pickSameDayLocatedNexts(
  jobs: readonly TravelJob[],
  slotEnd: Date,
  dateKey: string,
  timeZone: string,
): TravelJob[] {
  const located = locatedJobsOnDate(jobs, dateKey, timeZone).filter(
    (job) => job.start.getTime() >= slotEnd.getTime(),
  );
  let earliestStart: number | null = null;
  for (const job of located) {
    if (earliestStart == null || job.start.getTime() < earliestStart) {
      earliestStart = job.start.getTime();
    }
  }
  if (earliestStart == null) return [];
  return located.filter((job) => job.start.getTime() === earliestStart);
}

export function stackPairKey(from: string, to: string) {
  return `${from}\n${to}`;
}

export function stackDriveForAddress(
  from: string,
  to: string,
  shootAddress: string,
  measured: ReadonlyMap<string, number | null>,
): number | null {
  if (sameAddress(from, shootAddress) && sameAddress(to, shootAddress)) return 0;
  if (sameAddress(from, to)) return 0;
  const value = measured.get(stackPairKey(from, to));
  return value === undefined ? null : value;
}

/**
 * Soft score: live drive minutes to the immediate same-day located
 * neighbor before and/or after the slot. Lower is better. Null means
 * no same-day located work (or drive time could not be read) — no boost.
 */
export function scoreSlotStack(input: {
  start: Date;
  end: Date;
  dateKey: string;
  shootAddress: string;
  jobs: readonly TravelJob[];
  timeZone: string;
  measured: ReadonlyMap<string, number | null>;
}): number | null {
  const times: number[] = [];
  for (const prior of pickSameDayLocatedPriors(input.jobs, input.start, input.dateKey, input.timeZone)) {
    if (!prior.address) continue;
    const seconds = sameAddress(prior.address, input.shootAddress)
      ? 0
      : stackDriveForAddress(prior.address, input.shootAddress, input.shootAddress, input.measured);
    if (seconds != null) times.push(seconds);
  }
  for (const next of pickSameDayLocatedNexts(input.jobs, input.end, input.dateKey, input.timeZone)) {
    if (!next.address) continue;
    const seconds = sameAddress(next.address, input.shootAddress)
      ? 0
      : stackDriveForAddress(input.shootAddress, next.address, input.shootAddress, input.measured);
    if (seconds != null) times.push(seconds);
  }
  if (times.length === 0) return null;
  return Math.min(...times);
}

export function isStrongStackScore(stackDriveSeconds: number | null | undefined) {
  return stackDriveSeconds != null && stackDriveSeconds <= STACK_STRONG_DRIVE_SECONDS;
}

export function compareStackedSlots(a: StackableSlot, b: StackableSlot) {
  const date = a.dateKey.localeCompare(b.dateKey);
  if (date !== 0) return date;
  const aRank = a.stackDriveSeconds == null ? Number.POSITIVE_INFINITY : a.stackDriveSeconds;
  const bRank = b.stackDriveSeconds == null ? Number.POSITIVE_INFINITY : b.stackDriveSeconds;
  if (aRank !== bRank) return aRank - bRank;
  return a.start.localeCompare(b.start);
}

export function sortSlotsByStack<T extends StackableSlot>(slots: readonly T[]): T[] {
  return [...slots].sort(compareStackedSlots);
}

/**
 * Soonest date with a strong same-day stack; otherwise soonest date that
 * still has a legal slot.
 */
export function pickSuggestedDate(slots: readonly StackableSlot[]): string | null {
  const dates = [...new Set(slots.map((slot) => slot.dateKey))].sort();
  const stacked = dates.find((dateKey) =>
    slots.some((slot) => slot.dateKey === dateKey && isStrongStackScore(slot.stackDriveSeconds)),
  );
  return stacked ?? dates[0] ?? null;
}

export function collectStackDrivePairs(input: {
  shootAddress: string;
  slots: readonly { start: string; end: string; dateKey: string }[];
  jobs: readonly TravelJob[];
  timeZone: string;
  alreadyMeasured: ReadonlyMap<string, number | null>;
}): Map<string, { from: string; to: string; departAt: Date }> {
  const needed = new Map<string, { from: string; to: string; departAt: Date }>();
  for (const slot of input.slots) {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    for (const prior of pickSameDayLocatedPriors(input.jobs, start, slot.dateKey, input.timeZone)) {
      if (!prior.address || sameAddress(prior.address, input.shootAddress)) continue;
      const key = stackPairKey(prior.address, input.shootAddress);
      if (input.alreadyMeasured.has(key) || needed.has(key)) continue;
      needed.set(key, { from: prior.address, to: input.shootAddress, departAt: prior.end });
    }
    for (const next of pickSameDayLocatedNexts(input.jobs, end, slot.dateKey, input.timeZone)) {
      if (!next.address || sameAddress(next.address, input.shootAddress)) continue;
      const key = stackPairKey(input.shootAddress, next.address);
      if (input.alreadyMeasured.has(key) || needed.has(key)) continue;
      needed.set(key, { from: input.shootAddress, to: next.address, departAt: end });
    }
  }
  return needed;
}
