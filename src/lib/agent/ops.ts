import { eq } from "drizzle-orm";
import { clientCounts, createClientRecord, deleteClientRecord, findClient, listClientRows, updateClientRecord } from "@/lib/admin/clients";
import { isUuid } from "@/lib/admin/ids";
import {
  ensureShootPublicToken,
  getShootRecord,
  listMediaForClientShoots,
  listShootMedia,
  listShootRecordsForClient,
  type ShootRecord,
} from "@/lib/admin/shoots";
import { syncNasForAdmin } from "@/lib/admin/sync";
import { listUsersForClient, removeClientUserRecord, updateClientUserRecord } from "@/lib/admin/users";
import {
  clientMatchesQuery,
  confirmDeleteClient,
  notesSummary,
  selectBookings,
  shootShare,
  summarizeMedia,
  toPublicUser,
  type BookingWhen,
} from "@/lib/agent/present";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, type Booking } from "@/lib/db/schema";
import {
  commitBookingCancellation,
  finishBookingModification,
  prepareBookingModification,
} from "@/lib/scheduling/booking-commit";
import { canAdminModifyBooking, getBookingById } from "@/lib/scheduling/bookings";
import { bookingServiceList } from "@/lib/scheduling/services";

export type ClientSummary = {
  id: string;
  inviteCode: string;
  displayName: string;
  company: string | null;
  primaryEmail: string;
  notesSummary: string;
  userCount: number;
  shootCount: number;
  createdAt: string;
};

export type ClientDetail = ClientSummary & { notes: string | null };

export type BookingDto = {
  id: string;
  clientId: string;
  inviteCode: string;
  clientName: string;
  address: string;
  services: string[];
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  accessCodes: string | null;
  calendarEventId: string | null;
  syncIssue: string | null;
  canModify: boolean;
};

export type AgentOps = {
  listClients(input: { query?: string }): Promise<ClientSummary[]>;
  getClient(input: { id?: string; inviteCode?: string }): Promise<{ ok: true; client: ClientDetail } | { ok: false; error: string }>;
  createClient(input: {
    displayName?: string;
    primaryEmail?: string;
    company?: string | null;
    notes?: string | null;
  }): Promise<{ ok: true; client: ClientDetail } | { ok: false; error: string }>;
  updateClient(input: {
    clientId: string;
    displayName?: string;
    primaryEmail?: string;
    company?: string | null;
    notes?: string | null;
  }): Promise<{ ok: true; client: ClientDetail } | { ok: false; error: string }>;
  deleteClient(input: { clientId: string; confirmInviteCode: string }): Promise<
    { ok: true; client: { id: string; inviteCode: string } } | { ok: false; error: string }
  >;
  listUsers(input: { clientId: string }): Promise<{ ok: true; users: ReturnType<typeof toPublicUser>[] } | { ok: false; error: string }>;
  updateUser(input: {
    clientId: string;
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    company?: string;
  }): Promise<{ ok: true; user: ReturnType<typeof toPublicUser> } | { ok: false; error: string }>;
  removeUser(input: { clientId: string; userId: string }): Promise<
    { ok: true; user: { id: string; email: string } } | { ok: false; error: string }
  >;
  syncFromNas(): Promise<
    | {
        ok: true;
        sync: {
          clientsCreated: number;
          clientsReused: number;
          shootsCreated: number;
          shootsReused: number;
          mediaImported: number;
          mediaUpdated: number;
          mediaRemoved: number;
          shootsRemoved: number;
          ready: number;
          warnings: string[];
        };
      }
    | { ok: false; error: string }
  >;
  listBookings(input: {
    when: BookingWhen;
    clientId?: string;
    inviteCode?: string;
    limit: number;
    includeCancelled: boolean;
    now?: Date;
  }): Promise<{ ok: true; bookings: BookingDto[] } | { ok: false; error: string }>;
  getBooking(input: { bookingId: string }): Promise<{ ok: true; booking: BookingDto } | { ok: false; error: string }>;
  modifyBooking(input: {
    bookingId: string;
    address?: string;
    services?: string[];
    startsAt?: string;
    endsAt?: string | null;
    notes?: string | null;
  }): Promise<{ ok: true; booking: BookingDto; issues: { calendar: boolean; email: boolean } } | { ok: false; error: string }>;
  cancelBooking(input: { bookingId: string }): Promise<
    | {
        ok: true;
        booking: BookingDto;
        alreadyCancelled: boolean;
        issues: { calendar: boolean; email: boolean };
      }
    | { ok: false; error: string }
  >;
  listShoots(input: { clientId?: string; inviteCode?: string }): Promise<
    { ok: true; shoots: ShootSummary[] } | { ok: false; error: string }
  >;
  getShoot(input: { shootId: string }): Promise<{ ok: true; shoot: ShootDetail } | { ok: false; error: string }>;
  getShootShareLink(input: { shootId: string }): Promise<
    | { ok: true; shootId: string; publicToken: string; publicUrl: string; minted: boolean }
    | { ok: false; error: string }
  >;
};

export type ShootSummary = {
  id: string;
  clientId: string;
  inviteCode: string;
  clientName: string;
  shotDate: string;
  address: string;
  nasRelativePath: string | null;
  dropboxUrl: string | null;
  publicToken: string;
  publicUrl: string;
  mediaCounts: { photo: number; floor_plan: number; video: number; total: number };
  ready: boolean;
};

export type ShootDetail = ShootSummary & {
  photos: { id: string; filename: string; sortOrder: number }[];
  floorPlans: { id: string; filename: string; sortOrder: number }[];
  videos: { id: string; filename: string; sortOrder: number }[];
};

function summaryFrom(client: {
  id: string;
  inviteCode: string;
  displayName: string;
  company: string | null;
  primaryEmail: string;
  notes: string | null;
  createdAt: Date;
}, counts: { users: Map<string, number>; shoots: Map<string, number> }): ClientSummary {
  return {
    id: client.id,
    inviteCode: client.inviteCode,
    displayName: client.displayName,
    company: client.company,
    primaryEmail: client.primaryEmail,
    notesSummary: notesSummary(client.notes),
    userCount: counts.users.get(client.id) ?? 0,
    shootCount: counts.shoots.get(client.id) ?? 0,
    createdAt: client.createdAt.toISOString(),
  };
}

function detailFrom(
  client: Parameters<typeof summaryFrom>[0],
  counts: Parameters<typeof summaryFrom>[1],
): ClientDetail {
  return { ...summaryFrom(client, counts), notes: client.notes };
}

function bookingDto(row: Booking, clientName: string, inviteCode: string): BookingDto {
  return {
    id: row.id,
    clientId: row.clientId,
    inviteCode,
    clientName,
    address: row.address,
    services: bookingServiceList(row),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    notes: row.notes,
    accessCodes: row.accessCodes,
    calendarEventId: row.calendarEventId,
    syncIssue: row.syncIssue,
    canModify: canAdminModifyBooking(row),
  };
}

async function bookingWithClient(bookingId: string) {
  await ensureDb();
  const [row] = await db
    .select({
      booking: bookings,
      clientName: clients.displayName,
      inviteCode: clients.inviteCode,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

function shootSummary(row: ShootRecord, items: { id: string; type: string; filename: string; sortOrder: number }[]): ShootSummary {
  const media = summarizeMedia(items);
  const share = shootShare(row.publicToken);
  return {
    id: row.id,
    clientId: row.clientId,
    inviteCode: row.inviteCode,
    clientName: row.clientName,
    shotDate: row.shotDate,
    address: row.address,
    nasRelativePath: row.nasRelativePath,
    dropboxUrl: row.dropboxUrl,
    publicToken: share.publicToken,
    publicUrl: share.publicUrl,
    mediaCounts: media.counts,
    ready: media.ready,
  };
}

export const portalAgentOps: AgentOps = {
  async listClients({ query }) {
    const [rows, counts] = await Promise.all([listClientRows(), clientCounts()]);
    return rows
      .map((row) => summaryFrom(row, counts))
      .filter((row) => clientMatchesQuery(row, query));
  },

  async getClient(input) {
    const found = await findClient(input);
    if (!found.ok) return found;
    const counts = await clientCounts();
    return { ok: true, client: detailFrom(found.value, counts) };
  },

  async createClient(input) {
    const created = await createClientRecord(input);
    if (!created.ok) return created;
    const counts = await clientCounts();
    return { ok: true, client: detailFrom(created.value, counts) };
  },

  async updateClient(input) {
    const existing = await findClient({ id: input.clientId });
    if (!existing.ok) return existing;
    const saved = await updateClientRecord({
      clientId: input.clientId,
      displayName: input.displayName ?? existing.value.displayName,
      primaryEmail: input.primaryEmail ?? existing.value.primaryEmail,
      company: input.company === undefined ? existing.value.company ?? "" : input.company ?? "",
      notes: input.notes === undefined ? existing.value.notes ?? "" : input.notes ?? "",
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    const counts = await clientCounts();
    return { ok: true, client: detailFrom(saved.value, counts) };
  },

  async deleteClient(input) {
    const found = await findClient({ id: input.clientId });
    if (!found.ok) return found;
    const mismatch = confirmDeleteClient(found.value.inviteCode, input.confirmInviteCode ?? "");
    if (mismatch) return { ok: false, error: mismatch };
    const removed = await deleteClientRecord(found.value.id);
    if (!removed.ok) return removed;
    return { ok: true, client: { id: found.value.id, inviteCode: removed.value.inviteCode } };
  },

  async listUsers({ clientId }) {
    const listed = await listUsersForClient(clientId);
    if (!listed.ok) return listed;
    return {
      ok: true,
      users: listed.value.users.map((user) => toPublicUser(user, listed.value.client.company)),
    };
  },

  async updateUser(input) {
    const listed = await listUsersForClient(input.clientId);
    if (!listed.ok) return listed;
    const current = listed.value.users.find((user) => user.id === input.userId);
    if (!current) return { ok: false, error: "User was not found on this client." };
    const saved = await updateClientUserRecord({
      clientId: input.clientId,
      userId: input.userId,
      firstName: input.firstName ?? current.firstName,
      lastName: input.lastName ?? current.lastName,
      phone: input.phone ?? current.phone,
      email: input.email ?? current.email,
      companyName: input.company ?? listed.value.client.company,
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, user: toPublicUser(saved.value, saved.company) };
  },

  async removeUser(input) {
    const removed = await removeClientUserRecord(input);
    if (!removed.ok) return { ok: false, error: removed.error };
    return { ok: true, user: { id: input.userId, email: removed.email } };
  },

  async syncFromNas() {
    const result = await syncNasForAdmin();
    if (!result.ok) return result;
    const sync = result.value;
    return {
      ok: true,
      sync: {
        clientsCreated: sync.clientsCreated,
        clientsReused: sync.clientsReused,
        shootsCreated: sync.shootsCreated,
        shootsReused: sync.shootsReused,
        mediaImported: sync.mediaImported,
        mediaUpdated: sync.mediaUpdated,
        mediaRemoved: sync.mediaRemoved,
        shootsRemoved: sync.shootsRemoved,
        ready: sync.ready,
        warnings: sync.warnings,
      },
    };
  },

  async listBookings(input) {
    await ensureDb();
    let clientId = input.clientId?.trim() || undefined;
    if (clientId && !isUuid(clientId)) return { ok: false, error: "Client was not found." };
    if (input.inviteCode?.trim()) {
      const found = await findClient({ id: clientId, inviteCode: input.inviteCode });
      if (!found.ok) return found;
      clientId = found.value.id;
    }
    const rows = await db
      .select({
        booking: bookings,
        clientName: clients.displayName,
        inviteCode: clients.inviteCode,
      })
      .from(bookings)
      .innerJoin(clients, eq(bookings.clientId, clients.id));
    const picked = selectBookings(
      rows.map((row) => ({ ...row, startsAt: row.booking.startsAt, status: row.booking.status, clientId: row.booking.clientId })),
      {
        now: input.now ?? new Date(),
        when: input.when,
        includeCancelled: input.includeCancelled,
        clientId,
        limit: input.limit,
      },
    );
    return {
      ok: true,
      bookings: picked.map((row) => bookingDto(row.booking, row.clientName, row.inviteCode)),
    };
  },

  async getBooking({ bookingId }) {
    if (!isUuid(bookingId)) return { ok: false, error: "Booking was not found." };
    const row = await bookingWithClient(bookingId);
    if (!row) return { ok: false, error: "Booking was not found." };
    return { ok: true, booking: bookingDto(row.booking, row.clientName, row.inviteCode) };
  },

  async modifyBooking(input) {
    if (!isUuid(input.bookingId)) return { ok: false, error: "Booking was not found." };
    const booking = await getBookingById(input.bookingId);
    if (!booking) return { ok: false, error: "Booking was not found." };
    if (input.endsAt && !input.startsAt) {
      return { ok: false, error: "startsAt is required when endsAt is set." };
    }
    const notes =
      input.notes === undefined ? booking.notes : input.notes === null ? null : input.notes.trim() || null;
    const prepared = await prepareBookingModification({
      bookingId: booking.id,
      fromAdmin: true,
      session: null,
      address: input.address === undefined ? booking.address : input.address,
      services: input.services === undefined ? bookingServiceList(booking) : input.services,
      notes,
      startIso: input.startsAt?.trim() || booking.startsAt.toISOString(),
      endIso: input.endsAt?.trim() ? input.endsAt.trim() : null,
    });
    if (!prepared.ok) return { ok: false, error: prepared.error };
    let finished;
    try {
      finished = await finishBookingModification(prepared);
    } catch (error) {
      console.error("agent modify integrations failed; booking still saved", error);
      finished = { ok: true as const, bookingId: prepared.bookingId, issues: { calendar: true, email: true } };
    }
    const row = await bookingWithClient(finished.bookingId);
    if (!row) return { ok: false, error: "Booking was not found." };
    return { ok: true, booking: bookingDto(row.booking, row.clientName, row.inviteCode), issues: finished.issues };
  },

  async cancelBooking({ bookingId }) {
    if (!isUuid(bookingId)) return { ok: false, error: "Booking was not found." };
    const booking = await getBookingById(bookingId);
    if (!booking) return { ok: false, error: "Booking was not found." };
    if (booking.status === "cancelled") {
      const row = await bookingWithClient(booking.id);
      if (!row) return { ok: false, error: "Booking was not found." };
      return {
        ok: true,
        alreadyCancelled: true,
        issues: { calendar: false, email: false },
        booking: bookingDto(row.booking, row.clientName, row.inviteCode),
      };
    }
    const outcome = await commitBookingCancellation({ booking, session: null });
    const row = await bookingWithClient(booking.id);
    if (!row) return { ok: false, error: "Booking was not found." };
    return {
      ok: true,
      alreadyCancelled: !outcome.updated,
      issues: {
        calendar: outcome.issues.calendar === "failed",
        email: outcome.issues.email === "failed",
      },
      booking: bookingDto(row.booking, row.clientName, row.inviteCode),
    };
  },

  async listShoots(input) {
    const found = await findClient(input);
    if (!found.ok) return found;
    const listed = await listShootRecordsForClient(found.value.id);
    if (!listed.ok) return listed;
    const mediaRows = await listMediaForClientShoots(listed.value.map((row) => row.id));
    const byShoot = new Map<string, typeof mediaRows>();
    for (const item of mediaRows) {
      const list = byShoot.get(item.shootId) ?? [];
      list.push(item);
      byShoot.set(item.shootId, list);
    }
    return {
      ok: true,
      shoots: listed.value.map((row) => shootSummary(row, byShoot.get(row.id) ?? [])),
    };
  },

  async getShoot({ shootId }) {
    const found = await getShootRecord(shootId);
    if (!found.ok) return found;
    const items = await listShootMedia(found.value.id);
    const media = summarizeMedia(items);
    return {
      ok: true,
      shoot: {
        ...shootSummary(found.value, items),
        photos: media.photos,
        floorPlans: media.floorPlans,
        videos: media.videos,
      },
    };
  },

  async getShootShareLink({ shootId }) {
    const shared = await ensureShootPublicToken(shootId);
    if (!shared.ok) return shared;
    const link = shootShare(shared.value.token);
    return {
      ok: true,
      shootId,
      publicToken: link.publicToken,
      publicUrl: link.publicUrl,
      minted: shared.value.minted,
    };
  },
};
