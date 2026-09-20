import { sameAddress } from "./address";
import type { Interval } from "./intervals";
import { TRAVEL_PAD_MS } from "./rules";

export type TravelJob = {
  start: Date;
  end: Date;
  /** Null when Calendar marks busy time with no location — time-block only. */
  address: string | null;
};

export type TravelVerdict =
  | { ok: true; driveSecondsFromPrior: number | null }
  | { ok: false; reason: string };

function isJobList(job: TravelJob | readonly TravelJob[]): job is readonly TravelJob[] {
  return Array.isArray(job);
}

function asJobList(job: TravelJob | readonly TravelJob[] | null | undefined): TravelJob[] {
  if (job == null) return [];
  return isJobList(job) ? [...job] : [job];
}

/** Busy blocks become location-less jobs so abutment / pad still apply. */
export function travelJobsWithBusy(jobs: readonly TravelJob[], busy: readonly Interval[]): TravelJob[] {
  return [
    ...jobs,
    ...busy.map((block) => ({ start: block.start, end: block.end, address: null })),
  ];
}

export function pickPriorJobs(jobs: readonly TravelJob[], slotStart: Date): TravelJob[] {
  let latestEnd: number | null = null;
  for (const job of jobs) {
    if (job.end.getTime() <= slotStart.getTime()) {
      if (latestEnd == null || job.end.getTime() > latestEnd) latestEnd = job.end.getTime();
    }
  }
  if (latestEnd == null) return [];
  return jobs.filter((job) => job.end.getTime() === latestEnd);
}

export function pickNextJobs(jobs: readonly TravelJob[], slotEnd: Date): TravelJob[] {
  let earliestStart: number | null = null;
  for (const job of jobs) {
    if (job.start.getTime() >= slotEnd.getTime()) {
      if (earliestStart == null || job.start.getTime() < earliestStart) {
        earliestStart = job.start.getTime();
      }
    }
  }
  if (earliestStart == null) return [];
  return jobs.filter((job) => job.start.getTime() === earliestStart);
}

function preferLocatedJob(jobs: readonly TravelJob[]): TravelJob | null {
  return jobs.find((job) => job.address) ?? jobs[0] ?? null;
}

export function pickPriorJob(jobs: TravelJob[], slotStart: Date): TravelJob | null {
  return preferLocatedJob(pickPriorJobs(jobs, slotStart));
}

export function pickNextJob(jobs: TravelJob[], slotEnd: Date): TravelJob | null {
  return preferLocatedJob(pickNextJobs(jobs, slotEnd));
}

function padBeforeNextFits(slotEnd: Date, nextStart: Date) {
  return slotEnd.getTime() + TRAVEL_PAD_MS <= nextStart.getTime();
}

function padAfterPriorFits(priorEnd: Date, slotStart: Date) {
  return priorEnd.getTime() + TRAVEL_PAD_MS <= slotStart.getTime();
}

/**
 * Travel hard-block. `driveSeconds` must return a live measurement or null.
 * Null is a refuse — never treat unknown geography as zero.
 *
 * Prior and next may be a single neighbor or every job that shares that
 * neighbor's start/end (two noon events, free/busy + located Calendar job).
 */
export function travelFits(input: {
  slot: Interval;
  newAddress: string;
  prior: TravelJob | readonly TravelJob[] | null;
  next: TravelJob | readonly TravelJob[] | null;
  driveSeconds: (from: string, to: string) => number | null;
}): TravelVerdict {
  let driveSecondsFromPrior: number | null = null;

  for (const prior of asJobList(input.prior)) {
    if (!prior.address) {
      if (!padAfterPriorFits(prior.end, input.slot.start)) {
        return { ok: false, reason: "Need 15 minutes after the prior busy time." };
      }
      continue;
    }
    if (sameAddress(prior.address, input.newAddress)) {
      if (!padAfterPriorFits(prior.end, input.slot.start)) {
        return { ok: false, reason: "Need 15 minutes after the prior job at this address." };
      }
    } else {
      const seconds = input.driveSeconds(prior.address, input.newAddress);
      if (seconds == null) {
        return { ok: false, reason: "Drive time from the prior job could not be measured." };
      }
      driveSecondsFromPrior = seconds;
      const readyAt = prior.end.getTime() + seconds * 1000 + TRAVEL_PAD_MS;
      if (readyAt > input.slot.start.getTime()) {
        return {
          ok: false,
          reason: "Travel from the prior job plus the 15-minute pad does not fit.",
        };
      }
    }
  }

  for (const next of asJobList(input.next)) {
    if (!next.address) {
      if (!padBeforeNextFits(input.slot.end, next.start)) {
        return { ok: false, reason: "Need 15 minutes before the next busy time." };
      }
      continue;
    }
    if (sameAddress(next.address, input.newAddress)) {
      if (!padBeforeNextFits(input.slot.end, next.start)) {
        return { ok: false, reason: "Need 15 minutes before the next job at this address." };
      }
    } else {
      const seconds = input.driveSeconds(input.newAddress, next.address);
      if (seconds == null) {
        return { ok: false, reason: "Drive time to the next job could not be measured." };
      }
      const arriveNext = input.slot.end.getTime() + seconds * 1000 + TRAVEL_PAD_MS;
      if (arriveNext > next.start.getTime()) {
        return {
          ok: false,
          reason: "Travel to the next job plus the 15-minute pad does not fit.",
        };
      }
    }
  }

  return { ok: true, driveSecondsFromPrior };
}
