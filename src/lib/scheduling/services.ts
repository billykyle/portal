import { DEFAULT_SLOT_MINUTES } from "./rules";

/**
 * Client-bookable services, grouped by industry. One catalog for the
 * Scheduling picker, booking records, and admin. The client portal only
 * offers the services for that client's category (`category-services.ts`).
 * Admin and agent booking still use this full list. Clients may select more
 * than one option, except exclusive groups
 * (Podcast episode count, Social Media Video option, and Meeting length).
 * Twilight can be selected with other services on a new client booking.
 * That creates two appointments. Admin Book a shoot and agent booking may
 * store Twilight with other services as one appointment.
 * Do not invent prices here.
 * Slot length is the **sum** of selected option minutes (never longest-only).
 */
export const SCHEDULING_INDUSTRIES = [
  {
    industry: "Real Estate",
    options: ["Photography", "Video", "Aerial Photos", "Twilight", "Zillow 360", "Exterior Only"],
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

/** Stored exactly as "Commercial video". The booking label capitalizes Video. Length is chosen in whole hours. */
export const COMMERCIAL_VIDEO_SERVICE = "Commercial video" as const;

export const COMMERCIAL_VIDEO_MIN_HOURS = 1;
export const COMMERCIAL_VIDEO_MAX_HOURS = 8;

export const COMMERCIAL_VIDEO_HOURS_ERROR = "Choose how long you need Commercial video.";

/** Stored as group · option. The two options are exclusive. */
export const SOCIAL_MEDIA_VIDEO_LABEL = "Social Media Video" as const;
export const SOCIAL_MEDIA_MONTHLY_BATCH = "Social Media Video · Monthly Batch Video" as const;
export const SOCIAL_MEDIA_LONG_FORM = "Social Media Video · Long Form Content Creation" as const;

export const SOCIAL_MEDIA_VIDEO_OPTIONS = [
  { id: SOCIAL_MEDIA_MONTHLY_BATCH, label: "Monthly Batch Video", minutes: 60 },
  { id: SOCIAL_MEDIA_LONG_FORM, label: "Long Form Content Creation", minutes: 120 },
] as const;

/** Stored as group · option. The two lengths are exclusive. */
export const MEETING_LABEL = "Meeting" as const;
export const MEETING_30 = "Meeting · 30 min appointment" as const;
export const MEETING_60 = "Meeting · 1 hour appointment" as const;

export const MEETING_OPTIONS = [
  { id: MEETING_30, label: "30 min appointment", minutes: 30 },
  { id: MEETING_60, label: "1 hour appointment", minutes: 60 },
] as const;

export const SCHEDULING_SERVICES = [
  ...SCHEDULING_INDUSTRIES.flatMap((group) =>
    group.options.map((option) => schedulingServiceId(group.industry, option)),
  ),
  COMMERCIAL_VIDEO_SERVICE,
  SOCIAL_MEDIA_MONTHLY_BATCH,
  SOCIAL_MEDIA_LONG_FORM,
  MEETING_30,
  MEETING_60,
];

export type SchedulingService = (typeof SCHEDULING_SERVICES)[number];

/** Stored as Real Estate · Twilight. Its own 30-minute Philadelphia sunset slot. */
export const TWILIGHT_SERVICE = "Real Estate · Twilight" as const satisfies SchedulingService;

/**
 * Locked minutes per option (Billy, 2026-09-20). Multi-select bookings
 * **sum** these values.
 */
export const SCHEDULING_SERVICE_MINUTES = {
  "Real Estate · Photography": 45,
  "Real Estate · Video": 30,
  "Real Estate · Aerial Photos": 15,
  "Real Estate · Twilight": 30,
  "Real Estate · Zillow 360": 15,
  "Real Estate · Exterior Only": 15,
  "Construction · Photography": 45,
  "Construction · Video": 45,
  "Podcast · 1 episode": 60,
  "Podcast · 2 episodes": 105,
  "Social Media Video · Monthly Batch Video": 60,
  "Social Media Video · Long Form Content Creation": 120,
  "Meeting · 30 min appointment": 30,
  "Meeting · 1 hour appointment": 60,
} as const;

export function commercialHourLabel(hours: number) {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Whole hours 1–8. Anything else, including a blank, is not a length. */
export function parseCommercialVideoHours(raw: unknown): number | null {
  if (typeof raw === "number") return commercialHour(raw);
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  return commercialHour(Number(text));
}

function commercialHour(value: number): number | null {
  if (!Number.isInteger(value)) return null;
  if (value < COMMERCIAL_VIDEO_MIN_HOURS || value > COMMERCIAL_VIDEO_MAX_HOURS) return null;
  return value;
}

export function includesCommercialVideo(services: readonly string[]) {
  return parseSchedulingServices(services).includes(COMMERCIAL_VIDEO_SERVICE);
}

export function includesSocialMediaVideo(services: readonly string[]) {
  const parsed = parseSchedulingServices(services);
  return (
    parsed.includes(SOCIAL_MEDIA_MONTHLY_BATCH) || parsed.includes(SOCIAL_MEDIA_LONG_FORM)
  );
}

const CONSTRUCTION_SERVICE_IDS = new Set<string>(
  SCHEDULING_INDUSTRIES.filter((group) => group.industry === "Construction").flatMap((group) =>
    group.options.map((option) => schedulingServiceId(group.industry, option)),
  ),
);

/**
 * Construction Photography, Construction Video, or any other Construction
 * option — alone or together. A mix with another industry keeps daytime hours.
 */
export function bookingUsesAllDayHours(services: readonly string[]) {
  const parsed = parseSchedulingServices(services);
  return parsed.length > 0 && parsed.every((service) => CONSTRUCTION_SERVICE_IDS.has(service));
}

/** Commercial video and Social Media Video must finish at or before 6:00pm ET. */
export function bookingRequiresEndByClose(services: readonly string[]) {
  return includesCommercialVideo(services) || includesSocialMediaVideo(services);
}

/** Hours to store. Cleared when Commercial video is not one of the services. */
export function commercialVideoHoursForServices(services: readonly string[], raw: unknown): number | null {
  if (!includesCommercialVideo(services)) return null;
  return parseCommercialVideoHours(raw);
}

/**
 * Sum of selected option minutes — never longest-only. Empty / unknown → default slot.
 * Commercial video adds `hours * 60` and returns null until those hours are 1–8.
 */
export function bookingSlotMinutes(
  services: readonly string[],
  commercialHours?: number | null,
): number | null {
  const parsed = parseSchedulingServices(services);
  if (parsed.length === 0) return DEFAULT_SLOT_MINUTES;
  const hours = parseCommercialVideoHours(commercialHours);
  if (parsed.includes(COMMERCIAL_VIDEO_SERVICE) && hours == null) return null;
  return parsed.reduce((total, service) => {
    if (service === COMMERCIAL_VIDEO_SERVICE) return total + (hours ?? 0) * 60;
    const minutes = SCHEDULING_SERVICE_MINUTES[service as keyof typeof SCHEDULING_SERVICE_MINUTES];
    return total + (minutes ?? DEFAULT_SLOT_MINUTES);
  }, 0);
}

const SERVICE_SET = new Set<string>(SCHEDULING_SERVICES);

/** Exclusive options replace each other. Keyed by service id → group name. */
const EXCLUSIVE_GROUP_KEY = new Map<string, string>();
for (const group of SCHEDULING_INDUSTRIES) {
  if (!isExclusiveIndustry(group)) continue;
  for (const option of group.options) {
    EXCLUSIVE_GROUP_KEY.set(schedulingServiceId(group.industry, option), group.industry);
  }
}
for (const option of SOCIAL_MEDIA_VIDEO_OPTIONS) {
  EXCLUSIVE_GROUP_KEY.set(option.id, SOCIAL_MEDIA_VIDEO_LABEL);
}
for (const option of MEETING_OPTIONS) {
  EXCLUSIVE_GROUP_KEY.set(option.id, MEETING_LABEL);
}

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
  const lastExclusive = new Map<string, SchedulingService>();
  for (const value of flattenServiceInputs(raw)) {
    const parsed = parseSchedulingService(value);
    if (!parsed) continue;
    seen.add(parsed);
    const group = EXCLUSIVE_GROUP_KEY.get(parsed);
    if (group) lastExclusive.set(group, parsed);
  }
  return SCHEDULING_SERVICES.filter((item) => {
    if (!seen.has(item)) return false;
    const group = EXCLUSIVE_GROUP_KEY.get(item);
    if (group) return lastExclusive.get(group) === item;
    return true;
  });
}

/** Add or remove a service. Exclusive group options replace each other. */
export function toggleSchedulingService(
  current: readonly string[],
  value: string,
  options?: { pairTwilight?: boolean },
): SchedulingService[] {
  const parsed = parseSchedulingService(value);
  if (!parsed) return parseSchedulingServices(current);
  const selected = new Set(parseSchedulingServices(current));
  const pairTwilight = options?.pairTwilight === true;
  if (!pairTwilight && parsed === TWILIGHT_SERVICE) {
    if (selected.has(TWILIGHT_SERVICE) && selected.size === 1) selected.delete(TWILIGHT_SERVICE);
    else {
      selected.clear();
      selected.add(TWILIGHT_SERVICE);
    }
    return SCHEDULING_SERVICES.filter((item) => selected.has(item));
  }
  if (selected.has(parsed)) {
    selected.delete(parsed);
  } else {
    if (!pairTwilight) selected.delete(TWILIGHT_SERVICE);
    const group = EXCLUSIVE_GROUP_KEY.get(parsed);
    if (group) {
      for (const item of SCHEDULING_SERVICES) {
        if (EXCLUSIVE_GROUP_KEY.get(item) === group) selected.delete(item);
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
