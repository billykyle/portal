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

export function pickPriorJob(jobs: TravelJob[], slotStart: Date): TravelJob | null {
  let prior: TravelJob | null = null;
  for (const job of jobs) {
    if (job.end.getTime() <= slotStart.getTime()) {
      if (!prior || job.end.getTime() > prior.end.getTime()) prior = job;
    }
  }
  return prior;
}

export function pickNextJob(jobs: TravelJob[], slotEnd: Date): TravelJob | null {
  let next: TravelJob | null = null;
  for (const job of jobs) {
    if (job.start.getTime() >= slotEnd.getTime()) {
      if (!next || job.start.getTime() < next.start.getTime()) next = job;
    }
  }
  return next;
}

/**
 * Travel hard-block. `driveSeconds` must return a live measurement or null.
 * Null is a refuse — never treat unknown geography as zero.
 */
export function travelFits(input: {
  slot: Interval;
  newAddress: string;
  prior: TravelJob | null;
  next: TravelJob | null;
  driveSeconds: (from: string, to: string) => number | null;
}): TravelVerdict {
  let driveSecondsFromPrior: number | null = null;

  if (input.prior?.address) {
    if (sameAddress(input.prior.address, input.newAddress)) {
      if (input.prior.end.getTime() + TRAVEL_PAD_MS > input.slot.start.getTime()) {
        return { ok: false, reason: "Need 15 minutes after the prior job at this address." };
      }
    } else {
      const seconds = input.driveSeconds(input.prior.address, input.newAddress);
      if (seconds == null) {
        return { ok: false, reason: "Drive time from the prior job could not be measured." };
      }
      driveSecondsFromPrior = seconds;
      const readyAt = input.prior.end.getTime() + seconds * 1000 + TRAVEL_PAD_MS;
      if (readyAt > input.slot.start.getTime()) {
        return {
          ok: false,
          reason: "Travel from the prior job plus the 15-minute pad does not fit.",
        };
      }
    }
  }

  if (input.next?.address) {
    if (sameAddress(input.next.address, input.newAddress)) {
      if (input.slot.end.getTime() + TRAVEL_PAD_MS > input.next.start.getTime()) {
        return { ok: false, reason: "Need 15 minutes before the next job at this address." };
      }
    } else {
      const seconds = input.driveSeconds(input.newAddress, input.next.address);
      if (seconds == null) {
        return { ok: false, reason: "Drive time to the next job could not be measured." };
      }
      const arriveNext = input.slot.end.getTime() + seconds * 1000 + TRAVEL_PAD_MS;
      if (arriveNext > input.next.start.getTime()) {
        return {
          ok: false,
          reason: "Travel to the next job plus the 15-minute pad does not fit.",
        };
      }
    }
  }

  return { ok: true, driveSecondsFromPrior };
}
