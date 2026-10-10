import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clientAgentCalls, clients, media, shoots } from "@/lib/db/schema";
import type { ClientAgentOps } from "@/lib/client-agent/handlers";
import { clientBookingSummary, clientShootDetail, clientShootSummary } from "@/lib/client-agent/present";
import { cancelClientAgentBooking, createClientAgentBooking, modifyClientAgentBooking } from "@/lib/client-agent/book";
import { isClientCategory } from "@/lib/client-category";
import { loadLiveAvailabilitySources, offerSlotsForAddress } from "@/lib/scheduling/availability";
import { loadConfirmedPortalJobs, loadConfirmedTwilightDays } from "@/lib/scheduling/bookings";
import { clientCategoryServiceError, servicesForClientCategory } from "@/lib/scheduling/category-services";
import {
  commercialVideoHoursForServices,
  includesCommercialVideo,
  COMMERCIAL_VIDEO_HOURS_ERROR,
  parseSchedulingServices,
} from "@/lib/scheduling/services";
import { twilightBookingFlow } from "@/lib/scheduling/twilight-pair";
import { includesTwilight } from "@/lib/scheduling/twilight";

function publicSlots(slots: { start: string; end: string; dateKey: string; dateLabel: string; timeLabel: string }[]) {
  return slots.map((slot) => ({
    start: slot.start,
    end: slot.end,
    date: slot.dateKey,
    label: `${slot.dateLabel} ${slot.timeLabel}`,
  }));
}

async function clientShareSlug(clientId: string) {
  const [client] = await db
    .select({ publicSlug: clients.publicSlug })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return client?.publicSlug ?? "";
}

async function shootsFor(clientId: string, limit: number) {
  await ensureDb();
  const rows = await db
    .select()
    .from(shoots)
    .where(eq(shoots.clientId, clientId))
    .orderBy(desc(shoots.shotDate))
    .limit(limit);
  if (rows.length === 0) return [];
  const mediaRows = await db
    .select()
    .from(media)
    .where(inArray(media.shootId, rows.map((row) => row.id)));
  const byShoot = new Map<string, typeof mediaRows>();
  for (const item of mediaRows) {
    const list = byShoot.get(item.shootId) ?? [];
    list.push(item);
    byShoot.set(item.shootId, list);
  }
  return rows.map((row) => ({ row, items: byShoot.get(row.id) ?? [] }));
}

export const portalClientAgentOps: ClientAgentOps = {
  async listShoots(clientId, limit) {
    const rows = await shootsFor(clientId, limit);
    const clientSlug = await clientShareSlug(clientId);
    return rows.map(({ row, items }) => clientShootSummary(row, items, clientSlug));
  },
  async getShoot(clientId, shootId) {
    await ensureDb();
    const [row] = await db
      .select()
      .from(shoots)
      .where(and(eq(shoots.id, shootId), eq(shoots.clientId, clientId)))
      .limit(1);
    if (!row) return null;
    const items = await db.select().from(media).where(eq(media.shootId, row.id));
    return clientShootDetail(row, items, await clientShareSlug(clientId));
  },
  async listBookings(clientId, filter) {
    await ensureDb();
    const now = new Date();
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.clientId, clientId))
      .orderBy(desc(bookings.startsAt))
      .limit(500);
    const filtered = rows.filter((row) => {
      if (!filter.includeCancelled && row.status === "cancelled") return false;
      if (filter.when === "upcoming") return row.status === "confirmed" && row.startsAt != null && row.startsAt >= now;
      if (filter.when === "past") return row.startsAt != null && row.startsAt < now && row.status !== "queued";
      return true;
    });
    return filtered.slice(0, filter.limit).map(clientBookingSummary);
  },
  async getBooking(clientId, bookingId) {
    await ensureDb();
    const [row] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, clientId)))
      .limit(1);
    return row ? clientBookingSummary(row) : null;
  },
  async listServices(clientId) {
    await ensureDb();
    const [client] = await db
      .select({ category: clients.category })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) return null;
    return {
      category: client.category,
      services: [...servicesForClientCategory(client.category)],
    };
  },
  async availableSlots(input) {
    await ensureDb();
    const [client] = await db
      .select({ category: clients.category })
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);
    const category = client && isClientCategory(client.category) ? client.category : null;
    const categoryError = clientCategoryServiceError(input.services, category);
    if (categoryError) return { ok: false, error: categoryError };
    const services = parseSchedulingServices(input.services);
    const commercialHours = commercialVideoHoursForServices(services, input.commercialHours ?? null);
    if (includesCommercialVideo(services) && commercialHours == null) {
      return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR };
    }
    const portalJobs = await loadConfirmedPortalJobs();
    const sources = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in sources) return { ok: false, error: sources.error };
    const flow = twilightBookingFlow(services);
    if (flow.kind === "paired") {
      const [regular, twilight] = await Promise.all([
        offerSlotsForAddress(input.address, sources, flow.regular, { commercialHours }),
        offerSlotsForAddress(input.address, sources, flow.twilight, {
          twilightBookedDays: await loadConfirmedTwilightDays(),
        }),
      ]);
      if (regular.error) return { ok: false, error: regular.error };
      if (twilight.error) return { ok: false, error: twilight.error };
      return {
        ok: true,
        data: {
          address: regular.address,
          timeZone: regular.timeZone,
          slots: publicSlots(regular.slots),
          twilightSlots: publicSlots(twilight.slots),
        },
      };
    }
    const availability = await offerSlotsForAddress(input.address, sources, flow.services, {
      commercialHours,
      twilightBookedDays: includesTwilight(flow.services) ? await loadConfirmedTwilightDays() : undefined,
    });
    if (availability.error) return { ok: false, error: availability.error };
    return {
      ok: true,
      data: {
        address: availability.address,
        timeZone: availability.timeZone,
        slots: publicSlots(availability.slots),
      },
    };
  },
  createBooking: (input) => createClientAgentBooking(input),
  modifyBooking: (input) => modifyClientAgentBooking(input),
  cancelBooking: (input) => cancelClientAgentBooking(input),
  async audit(input) {
    await ensureDb();
    await db.insert(clientAgentCalls).values({
      tokenId: input.tokenId,
      portalClientId: input.clientId,
      userId: input.userId,
      tool: input.tool,
      summary: input.summary,
      ok: input.ok,
    });
  },
};
