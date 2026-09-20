/**
 * Client-bookable services, grouped by industry. One catalog for the
 * Scheduling picker, booking records, and admin. Clients may select more
 * than one option, including across industries. Do not invent prices here —
 * duration still uses the existing slot length in {@link ./rules}.
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

const SERVICE_SET = new Set<string>(SCHEDULING_SERVICES);

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

/** Allowlist-order unique services. Empty if none are valid. */
export function parseSchedulingServices(raw: unknown): SchedulingService[] {
  const seen = new Set<SchedulingService>();
  for (const value of flattenServiceInputs(raw)) {
    const parsed = parseSchedulingService(value);
    if (parsed) seen.add(parsed);
  }
  return SCHEDULING_SERVICES.filter((item) => seen.has(item));
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
