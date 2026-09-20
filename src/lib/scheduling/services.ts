/**
 * Client-bookable services. One list for the Scheduling picker, booking
 * records, and admin. Clients may select more than one. Do not invent
 * prices here — duration still uses the existing slot length in {@link ./rules}.
 */
export const SCHEDULING_SERVICES = [
  "Real Estate Photography",
  "Real Estate Videography",
  "Aerial Photography",
  "Aerial Videography",
  "FPV",
  "Construction Photography",
  "Construction Videography",
  "Commercial Photography",
  "Commercial Videography",
  "Aerial Inspection",
  "Marketing / Social Video",
  "Branding / Headshots",
  "Floor Plans (2D / 3D)",
  "Zillow 3D Tour",
  "Other / Custom",
] as const;

export type SchedulingService = (typeof SCHEDULING_SERVICES)[number];

const SERVICE_SET = new Set<string>(SCHEDULING_SERVICES);

export function parseSchedulingService(raw: string | null | undefined): SchedulingService | null {
  const service = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!SERVICE_SET.has(service)) return null;
  return service as SchedulingService;
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

export function formatBookingServices(services: readonly string[]): string {
  return services.join(" · ");
}

/** Prefer the `services` array; fall back to a legacy single `service` string. */
export function bookingServiceList(row: {
  services?: string[] | null;
  service?: string | null;
}): SchedulingService[] {
  if (row.services?.length) return parseSchedulingServices(row.services);
  return parseSchedulingServices(row.service);
}
