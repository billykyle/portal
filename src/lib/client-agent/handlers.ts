import { clipSummary } from "@/lib/client-agent/protocol";
import type { ClientAgentContext } from "@/lib/client-agent/access";
import type { ClientBookInput, ClientBookResult } from "@/lib/client-agent/book";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";
import { normalizeBookingWhen, clampLimit, type BookingWhen } from "@/lib/agent/present";

const WRITE_PATHS = [CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES, "/admin/bookings"];

export type ClientShootRow = {
  id: string;
  shotDate: string;
  dateLabel: string;
  address: string;
  counts: { photo: number; floor_plan: number; video: number; raw_video: number; total: number };
  ready: boolean;
  shareUrl: string;
};

export type ClientBookingRow = {
  id: string;
  address: string;
  services: string[];
  commercialVideoHours: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  notes: string | null;
};

export type SlotQuery = {
  clientId: string;
  address: string;
  services: string[];
  commercialHours?: number | null;
};

export type ClientAgentOps = {
  listShoots(clientId: string, limit: number): Promise<ClientShootRow[]>;
  getShoot(clientId: string, shootId: string): Promise<(ClientShootRow & {
    photos: unknown;
    floorPlans: unknown;
    videos: unknown;
    rawVideos: unknown;
  }) | null>;
  listBookings(clientId: string, filter: { when: BookingWhen; includeCancelled: boolean; limit: number }): Promise<ClientBookingRow[]>;
  getBooking(clientId: string, bookingId: string): Promise<ClientBookingRow | null>;
  listServices(clientId: string): Promise<{ category: string; services: string[] } | null>;
  availableSlots(input: SlotQuery): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  createBooking(input: ClientBookInput): Promise<ClientBookResult>;
  modifyBooking(input: {
    clientId: string;
    userId: string;
    email: string;
    bookingId: string;
    address?: string;
    services?: string[];
    notes?: string | null;
    commercialHours?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
  }): Promise<{ ok: true; bookingId: string; calendarFailed: boolean; emailFailed: boolean } | { ok: false; error: string }>;
  cancelBooking(input: {
    clientId: string;
    userId: string;
    email: string;
    bookingId: string;
  }): Promise<{ ok: true; bookingId: string; calendarFailed: boolean; emailFailed: boolean } | { ok: false; error: string }>;
  audit(input: { tokenId: string; clientId: string; userId: string; tool: string; summary: string; ok: boolean }): Promise<void>;
};

export type ClientToolResult = {
  ok: boolean;
  error?: string;
  data?: unknown;
  summary: string;
  revalidate: string[];
};

function fail(error: string): ClientToolResult {
  return { ok: false, error, summary: clipSummary(`Rejected: ${error}`), revalidate: [] };
}

function ok(data: unknown, summary: string, write = false): ClientToolResult {
  return { ok: true, data, summary: clipSummary(summary), revalidate: write ? WRITE_PATHS : [] };
}

export async function runClientTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ClientAgentContext,
  ops: ClientAgentOps,
): Promise<ClientToolResult> {
  switch (name) {
    case "list_my_shoots": {
      const shoots = await ops.listShoots(ctx.clientId, clampLimit(args.limit, 50, 200));
      return ok({ shoots }, shoots.length === 1 ? "Listed 1 shoot" : `Listed ${shoots.length} shoots`);
    }
    case "get_my_shoot": {
      const shootId = String(args.shootId ?? "").trim();
      if (!shootId) return fail("Shoot id is required.");
      const shoot = await ops.getShoot(ctx.clientId, shootId);
      if (!shoot) return fail("That shoot was not found.");
      return ok({ shoot }, `Shoot ${shoot.address}`);
    }
    case "list_my_bookings": {
      const bookings = await ops.listBookings(ctx.clientId, {
        when: normalizeBookingWhen(args.when),
        includeCancelled: args.includeCancelled === true,
        limit: clampLimit(args.limit, 50, 200),
      });
      return ok({ bookings }, bookings.length === 1 ? "Listed 1 booking" : `Listed ${bookings.length} bookings`);
    }
    case "get_my_booking": {
      const bookingId = String(args.bookingId ?? "").trim();
      if (!bookingId) return fail("Booking id is required.");
      const booking = await ops.getBooking(ctx.clientId, bookingId);
      if (!booking) return fail("That booking was not found.");
      return ok({ booking }, `Booking ${booking.address}`);
    }
    case "list_services": {
      const catalog = await ops.listServices(ctx.clientId);
      if (!catalog) return fail("This client was not found.");
      return ok(catalog, `Listed ${catalog.services.length} services for ${ctx.inviteCode}`);
    }
    case "get_available_slots": {
      const address = String(args.address ?? "").trim();
      const services = Array.isArray(args.services) ? args.services.map(String) : [];
      if (!address) return fail("Address is required.");
      if (services.length === 0) return fail("Pick at least one service.");
      const slots = await ops.availableSlots({
        clientId: ctx.clientId,
        address,
        services,
        commercialHours: typeof args.commercialHours === "number" ? args.commercialHours : null,
      });
      if (!slots.ok) return fail(slots.error);
      const count = slotCount(slots.data);
      return ok(slots.data, count === 1 ? "Listed 1 open time" : `Listed ${count} open times`);
    }
    case "create_booking": {
      const result = await ops.createBooking({
        clientId: ctx.clientId,
        userId: ctx.userId,
        email: ctx.email,
        address: String(args.address ?? ""),
        services: Array.isArray(args.services) ? args.services.map(String) : [],
        startsAt: String(args.startsAt ?? ""),
        endsAt: args.endsAt == null ? null : String(args.endsAt),
        twilightStartsAt: args.twilightStartsAt == null ? null : String(args.twilightStartsAt),
        twilightEndsAt: args.twilightEndsAt == null ? null : String(args.twilightEndsAt),
        notes: args.notes == null ? null : String(args.notes),
        commercialHours: typeof args.commercialHours === "number" ? args.commercialHours : null,
      });
      if (!result.ok) return fail(result.error);
      return ok(result, `Booked ${result.address}`, true);
    }
    case "modify_booking": {
      const bookingId = String(args.bookingId ?? "").trim();
      if (!bookingId) return fail("Booking id is required.");
      const result = await ops.modifyBooking({
        clientId: ctx.clientId,
        userId: ctx.userId,
        email: ctx.email,
        bookingId,
        address: args.address == null ? undefined : String(args.address),
        services: Array.isArray(args.services) ? args.services.map(String) : undefined,
        notes: args.notes === undefined ? undefined : args.notes == null ? null : String(args.notes),
        commercialHours: args.commercialHours === undefined ? undefined : typeof args.commercialHours === "number" ? args.commercialHours : null,
        startsAt: args.startsAt == null ? undefined : String(args.startsAt),
        endsAt: args.endsAt == null ? undefined : String(args.endsAt),
      });
      if (!result.ok) return fail(result.error);
      return ok(result, `Updated booking ${bookingId}`, true);
    }
    case "cancel_booking": {
      const bookingId = String(args.bookingId ?? "").trim();
      if (!bookingId) return fail("Booking id is required.");
      const result = await ops.cancelBooking({
        clientId: ctx.clientId,
        userId: ctx.userId,
        email: ctx.email,
        bookingId,
      });
      if (!result.ok) return fail(result.error);
      return ok(result, `Cancelled booking ${bookingId}`, true);
    }
    default:
      return fail("Unknown tool.");
  }
}

function slotCount(data: unknown) {
  if (!data || typeof data !== "object") return 0;
  const record = data as { slots?: unknown; twilightSlots?: unknown };
  const slots = Array.isArray(record.slots) ? record.slots.length : 0;
  const twilight = Array.isArray(record.twilightSlots) ? record.twilightSlots.length : 0;
  return slots + twilight;
}
