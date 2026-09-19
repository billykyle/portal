/**
 * Client-bookable services. One list for the Scheduling dropdown, booking
 * records, and admin. Do not invent prices here — duration still uses the
 * existing slot length in {@link ./rules}.
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
