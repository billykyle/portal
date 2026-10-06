import { eq } from "drizzle-orm";
import { isClientCategory, type ClientCategory } from "@/lib/client-category";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import {
  COMMERCIAL_VIDEO_SERVICE,
  MEETING_30,
  MEETING_60,
  parseSchedulingServices,
  SCHEDULING_SERVICES,
  SOCIAL_MEDIA_LONG_FORM,
  SOCIAL_MEDIA_MONTHLY_BATCH,
  type SchedulingService,
} from "./services";

/**
 * Social Media Video and Meeting stay on every client category.
 * Category rows below are the extra services for that industry.
 * `other` uses the full catalog, same as a missing or unknown category.
 */
const SHARED_CLIENT_SERVICES = [
  SOCIAL_MEDIA_MONTHLY_BATCH,
  SOCIAL_MEDIA_LONG_FORM,
  MEETING_30,
  MEETING_60,
] as const satisfies readonly SchedulingService[];

export const CLIENT_CATEGORY_SERVICES: Record<ClientCategory, readonly SchedulingService[]> = {
  real_estate: [
    "Real Estate · Photography",
    "Real Estate · Video",
    "Real Estate · Aerial Photos",
    "Real Estate · Zillow 360",
    ...SHARED_CLIENT_SERVICES,
  ],
  construction: [
    "Construction · Photography",
    "Construction · Video",
    ...SHARED_CLIENT_SERVICES,
  ],
  podcast: [
    "Podcast · 1 episode",
    "Podcast · 2 episodes",
    ...SHARED_CLIENT_SERVICES,
  ],
  commercial: [COMMERCIAL_VIDEO_SERVICE, ...SHARED_CLIENT_SERVICES],
  other: SCHEDULING_SERVICES,
};

/** Full catalog when the category is missing, blank, or not one we know. */
export function servicesForClientCategory(
  category: string | null | undefined,
): readonly SchedulingService[] {
  if (!category || !isClientCategory(category)) return SCHEDULING_SERVICES;
  return CLIENT_CATEGORY_SERVICES[category];
}

export function limitServicesToCategory(
  services: readonly string[],
  category: string | null | undefined,
): SchedulingService[] {
  const allowed = new Set<string>(servicesForClientCategory(category));
  return parseSchedulingServices(services).filter((service) => allowed.has(service));
}

/** Null when every service is one this category may book. */
export function clientCategoryServiceError(
  services: readonly string[],
  category: string | null | undefined,
): string | null {
  const allowed = new Set<string>(servicesForClientCategory(category));
  const blocked = parseSchedulingServices(services).filter((service) => !allowed.has(service));
  if (blocked.length === 0) return null;
  if (blocked.length === 1) return `${blocked[0]} is not available for this account.`;
  return "Those services are not available for this account.";
}

/** Category on the selected portal. A missing client row is the full-catalog fallback. */
export async function loadClientCategory(clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ category: clients.category })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return row?.category ?? null;
}
