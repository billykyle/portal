import type { AgentOps } from "@/lib/agent/ops";
import { clampLimit, normalizeBookingWhen } from "@/lib/agent/present";
import { CLIENT_ACCOUNT, CLIENT_HOME, CLIENT_LIBRARY, CLIENT_SCHEDULING, CLIENT_SCHEDULING_CONFIRMED, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

export type ToolOutcome =
  | { ok: true; data: unknown; revalidate: string[] }
  | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value;
}

function optionalNullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

export async function runAgentTool(
  name: string,
  args: Record<string, unknown>,
  ops: AgentOps,
): Promise<ToolOutcome> {
  switch (name) {
    case "list_clients": {
      const clients = await ops.listClients({ query: optionalText(args.query) });
      return { ok: true, data: { clients }, revalidate: [] };
    }
    case "get_client": {
      const result = await ops.getClient({
        id: optionalText(args.id),
        inviteCode: optionalText(args.inviteCode),
      });
      if (!result.ok) return result;
      return { ok: true, data: { client: result.client }, revalidate: [] };
    }
    case "create_client": {
      const result = await ops.createClient({
        displayName: optionalText(args.displayName),
        primaryEmail: optionalText(args.primaryEmail),
        company: optionalNullableText(args.company),
        notes: optionalNullableText(args.notes),
      });
      if (!result.ok) return result;
      return { ok: true, data: { client: result.client }, revalidate: ["/admin/clients"] };
    }
    case "update_client": {
      const clientId = text(args.clientId).trim();
      if (!clientId) return { ok: false, error: "Client id is required." };
      const result = await ops.updateClient({
        clientId,
        displayName: optionalText(args.displayName),
        primaryEmail: optionalText(args.primaryEmail),
        company: optionalNullableText(args.company),
        notes: optionalNullableText(args.notes),
      });
      if (!result.ok) return result;
      return {
        ok: true,
        data: { client: result.client },
        revalidate: ["/admin/clients", `/admin/clients/${clientId}`],
      };
    }
    case "delete_client": {
      const clientId = text(args.clientId).trim();
      const confirmInviteCode = text(args.confirmInviteCode);
      if (!clientId) return { ok: false, error: "Client id is required." };
      if (!confirmInviteCode.trim()) return { ok: false, error: "confirmInviteCode is required." };
      const result = await ops.deleteClient({ clientId, confirmInviteCode });
      if (!result.ok) return result;
      return { ok: true, data: { deleted: result.client }, revalidate: ["/admin/clients"] };
    }
    case "list_client_users": {
      const clientId = text(args.clientId).trim();
      if (!clientId) return { ok: false, error: "Client id is required." };
      const result = await ops.listUsers({ clientId });
      if (!result.ok) return result;
      return { ok: true, data: { users: result.users }, revalidate: [] };
    }
    case "update_client_user": {
      const clientId = text(args.clientId).trim();
      const userId = text(args.userId).trim();
      if (!clientId || !userId) return { ok: false, error: "Client id and user id are required." };
      const result = await ops.updateUser({
        clientId,
        userId,
        firstName: optionalText(args.firstName),
        lastName: optionalText(args.lastName),
        phone: optionalText(args.phone),
        email: optionalText(args.email),
        company: optionalText(args.company),
      });
      if (!result.ok) return result;
      return {
        ok: true,
        data: { user: result.user },
        revalidate: [
          "/admin/clients",
          `/admin/clients/${clientId}`,
          `/admin/clients/${clientId}/users/${userId}`,
          CLIENT_ACCOUNT,
          CLIENT_HOME,
          CLIENT_LIBRARY,
        ],
      };
    }
    case "remove_client_user": {
      const clientId = text(args.clientId).trim();
      const userId = text(args.userId).trim();
      if (!clientId || !userId) return { ok: false, error: "Client id and user id are required." };
      const result = await ops.removeUser({ clientId, userId });
      if (!result.ok) return result;
      return {
        ok: true,
        data: { removed: result.user },
        revalidate: ["/admin/clients", `/admin/clients/${clientId}`],
      };
    }
    case "sync_from_nas": {
      const result = await ops.syncFromNas();
      if (!result.ok) return result;
      return { ok: true, data: { sync: result.sync }, revalidate: ["/admin/clients"] };
    }
    case "list_bookings": {
      const result = await ops.listBookings({
        when: normalizeBookingWhen(args.when),
        clientId: optionalText(args.clientId),
        inviteCode: optionalText(args.inviteCode),
        limit: clampLimit(args.limit),
        includeCancelled: args.includeCancelled === true,
      });
      if (!result.ok) return result;
      return { ok: true, data: { bookings: result.bookings }, revalidate: [] };
    }
    case "get_booking": {
      const bookingId = text(args.bookingId).trim();
      if (!bookingId) return { ok: false, error: "Booking id is required." };
      const result = await ops.getBooking({ bookingId });
      if (!result.ok) return result;
      return { ok: true, data: { booking: result.booking }, revalidate: [] };
    }
    case "modify_booking": {
      const bookingId = text(args.bookingId).trim();
      if (!bookingId) return { ok: false, error: "Booking id is required." };
      const services = Array.isArray(args.services) ? args.services.filter((item) => typeof item === "string") : undefined;
      const result = await ops.modifyBooking({
        bookingId,
        address: optionalText(args.address),
        services,
        startsAt: optionalText(args.startsAt),
        endsAt: optionalNullableText(args.endsAt),
        notes: optionalNullableText(args.notes),
      });
      if (!result.ok) return result;
      return {
        ok: true,
        data: { booking: result.booking, issues: result.issues },
        revalidate: [
          CLIENT_SCHEDULING,
          CLIENT_SCHEDULING_TIMES,
          "/admin/bookings",
          `/admin/bookings/${bookingId}`,
        ],
      };
    }
    case "cancel_booking": {
      const bookingId = text(args.bookingId).trim();
      if (!bookingId) return { ok: false, error: "Booking id is required." };
      const result = await ops.cancelBooking({ bookingId });
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          booking: result.booking,
          alreadyCancelled: result.alreadyCancelled,
          issues: result.issues,
        },
        revalidate: [
          CLIENT_SCHEDULING,
          CLIENT_SCHEDULING_TIMES,
          `${CLIENT_SCHEDULING_CONFIRMED}/${bookingId}`,
          "/admin/bookings",
          `/admin/bookings/${bookingId}`,
        ],
      };
    }
    case "list_client_shoots": {
      const result = await ops.listShoots({
        clientId: optionalText(args.clientId),
        inviteCode: optionalText(args.inviteCode),
      });
      if (!result.ok) return result;
      return { ok: true, data: { shoots: result.shoots }, revalidate: [] };
    }
    case "get_shoot": {
      const shootId = text(args.shootId).trim();
      if (!shootId) return { ok: false, error: "Shoot id is required." };
      const result = await ops.getShoot({ shootId });
      if (!result.ok) return result;
      return { ok: true, data: { shoot: result.shoot }, revalidate: [] };
    }
    case "get_shoot_share_link": {
      const shootId = text(args.shootId).trim();
      if (!shootId) return { ok: false, error: "Shoot id is required." };
      const result = await ops.getShootShareLink({ shootId });
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          shootId: result.shootId,
          publicToken: result.publicToken,
          publicUrl: result.publicUrl,
          minted: result.minted,
        },
        revalidate: result.minted ? [`/shoots/${shootId}`] : [],
      };
    }
    default:
      return { ok: false, error: `Unknown tool ${name}.` };
  }
}
