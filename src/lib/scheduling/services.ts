import { DEFAULT_SLOT_MINUTES } from "./rules";

/**
 * Client-bookable services, grouped by industry. One catalog for the
 * Scheduling picker, booking records, and admin. Clients may select more
 * than one option, including across industries, except exclusive groups
 * (Podcast: 1 episode or 2 episodes). Do not invent prices here.
 * Slot length is the sum of selected option minutes; Aerial Photos is
 * still {@link DEFAULT_SLOT_MINUTES} until Billy locks a time.
 */
export const SCHEDULING_INDUSTRIES = [
  {
    industry: "Real Estate",
    options: ["Photography", "Video", "Aerial Photos", "Zillow 360"],
  },
  {
    industry: "Construction",
    options: ["Photography", "Video"],
  },
  {
    industry: "Podcast",
    options: ["1 episode", "2 episodes"],
    exclusive: true,
  },
] as const;

export type SchedulingIndustry = (typeof SCHEDULING_INDUSTRIES)[number]["industry"];

export function schedulingServiceId<I extends string, O extends string>(
  industry: I,
  option: O,
): `${I} · ${O}` {
  return `${industry} · ${option}`;
}

export const SCHEDULING_SERVICES = SCHEDULING_INDUSTRIES.flatMap((group) =>
  group.options.map((option) => schedulingServiceId(group.industry, option)),
);

export type SchedulingService = (typeof SCHEDULING_SERVICES)[number];

/**
 * Locked minutes per option (Billy, 2026-09-20). Aerial Photos is TBD —
 * keep the existing default slot instead of inventing 45.
 */
export const SCHEDULING_SERVICE_MINUTES = {
  "Real Estate · Photography": 45,
  "Real Estate · Video": 30,
  "Real Estate · Aerial Photos": DEFAULT_SLOT_MINUTES,
  "Real Estate · Zillow 360": 15,
  "Construction · Photography": 45,
  "Construction · Video": 45,
  "Podcast · 1 episode": 60,
  "Podcast · 2 episodes": 105,
} as const;

/** Sum of selected option minutes. Empty / unknown → existing default slot. */
export function bookingSlotMinutes(services: readonly string[]): number {
  const parsed = parseSchedulingServices(services);
  if (parsed.length === 0) return DEFAULT_SLOT_MINUTES;
  return parsed.reduce((total, service) => {
    const minutes = SCHEDULING_SERVICE_MINUTES[service as keyof typeof SCHEDULING_SERVICE_MINUTES];
    return total + (minutes ?? DEFAULT_SLOT_MINUTES);
  }, 0);
}

const SERVICE_SET = new Set<string>(SCHEDULING_SERVICES);

const SERVICE_INDUSTRY = new Map<SchedulingService, SchedulingIndustry>(
  SCHEDULING_INDUSTRIES.flatMap((group) =>
    group.options.map(
      (option) =>
        [schedulingServiceId(group.industry, option), group.industry] as const,
    ),
  ),
);

const EXCLUSIVE_INDUSTRIES = new Set<SchedulingIndustry>(
  SCHEDULING_INDUSTRIES.filter(isExclusiveIndustry).map((group) => group.industry),
);

export function isExclusiveIndustry(
  group: (typeof SCHEDULING_INDUSTRIES)[number],
): boolean {
  return "exclusive" in group && group.exclusive === true;
}

/**
 * Previous flat labels → industry · option. Used so older bookings and
 * query strings still resolve after the catalog change.
 */
const LEGACY_SCHEDULING_SERVICES: Record<string, SchedulingService> = {
  "Real Estate Photography": "Real Estate · Photography",
  "Real Estate Videography": "Real Estate · Video",
  "Aerial Photography": "Real Estate · Aerial Photos",
  "Zillow 3D Tour": "Real Estate · Zillow 360",
  "Construction Photography": "Construction · Photography",
  "Construction Videography": "Construction · Video",
};

function normalizeServiceInput(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

export function parseSchedulingService(raw: string | null | undefined): SchedulingService | null {
  const service = normalizeServiceInput(raw);
  if (SERVICE_SET.has(service)) return service as SchedulingService;
  return LEGACY_SCHEDULING_SERVICES[service] ?? null;
}

function flattenServiceInputs(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.flatMap((item) => flattenServiceInputs(item));
  if (typeof raw === "string") return [raw];
  return [];
}

/** Allowlist-order unique services. Empty if none are valid. Exclusive groups keep the last pick. */
export function parseSchedulingServices(raw: unknown): SchedulingService[] {
  const seen = new Set<SchedulingService>();
  const lastExclusive = new Map<SchedulingIndustry, SchedulingService>();
  for (const value of flattenServiceInputs(raw)) {
    const parsed = parseSchedulingService(value);
    if (!parsed) continue;
    seen.add(parsed);
    const industry = SERVICE_INDUSTRY.get(parsed);
    if (industry && EXCLUSIVE_INDUSTRIES.has(industry)) {
      lastExclusive.set(industry, parsed);
    }
  }
  return SCHEDULING_SERVICES.filter((item) => {
    if (!seen.has(item)) return false;
    const industry = SERVICE_INDUSTRY.get(item);
    if (industry && EXCLUSIVE_INDUSTRIES.has(industry)) {
      return lastExclusive.get(industry) === item;
    }
    return true;
  });
}

/** Add or remove a service; exclusive industry options replace each other. */
export function toggleSchedulingService(
  current: readonly string[],
  value: string,
): SchedulingService[] {
  const parsed = parseSchedulingService(value);
  if (!parsed) return parseSchedulingServices(current);
  const selected = new Set(parseSchedulingServices(current));
  if (selected.has(parsed)) {
    selected.delete(parsed);
  } else {
    const industry = SERVICE_INDUSTRY.get(parsed);
    if (industry && EXCLUSIVE_INDUSTRIES.has(industry)) {
      for (const item of SCHEDULING_SERVICES) {
        if (SERVICE_INDUSTRY.get(item) === industry) selected.delete(item);
      }
    }
    selected.add(parsed);
  }
  return SCHEDULING_SERVICES.filter((item) => selected.has(item));
}

export function formatSchedulingService(service: string): string {
  return parseSchedulingService(service) ?? normalizeServiceInput(service);
}

/** Each item is already "Industry · Option"; join multiples without another middle-dot. */
export function formatBookingServices(services: readonly string[]): string {
  return services.map(formatSchedulingService).filter(Boolean).join(", ");
}

/** Prefer the `services` array; fall back to a legacy single `service` string. */
export function bookingServiceList(row: {
  services?: string[] | null;
  service?: string | null;
}): string[] {
  const raw = row.services?.length ? row.services : flattenServiceInputs(row.service);
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of flattenServiceInputs(raw)) {
    const parsed = parseSchedulingService(value);
    const label = parsed ?? normalizeServiceInput(value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}
