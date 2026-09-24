import { publicShootUrl } from "@/lib/public-link";

export function notesSummary(notes: string | null | undefined, max = 140) {
  const text = String(notes ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function clientMatchesQuery(
  client: {
    inviteCode: string;
    displayName: string;
    company?: string | null;
    primaryEmail: string;
  },
  query: string | null | undefined,
) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [client.inviteCode, client.displayName, client.company, client.primaryEmail]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .includes(needle);
}

export type PublicUserInput = {
  id: string;
  clientId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date;
  passwordHash?: string;
};

/** Login rows never leave the process with a password hash. */
export function toPublicUser(user: PublicUserInput, company: string | null) {
  return {
    id: user.id,
    clientId: user.clientId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    company,
    createdAt: user.createdAt.toISOString(),
  };
}

export type MediaInventoryItem = {
  id: string;
  type: string;
  filename: string;
  sortOrder: number;
};

export function summarizeMedia(items: MediaInventoryItem[]) {
  const sorted = [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.filename.localeCompare(b.filename),
  );
  const pick = (type: string) =>
    sorted
      .filter((item) => item.type === type)
      .map(({ id, filename, sortOrder }) => ({ id, filename, sortOrder }));
  const photos = pick("photo");
  const floorPlans = pick("floor_plan");
  const videos = pick("video");
  const counts = {
    photo: photos.length,
    floor_plan: floorPlans.length,
    video: videos.length,
    total: sorted.length,
  };
  return { counts, ready: counts.total > 0, photos, floorPlans, videos };
}

export function shootShare(token: string) {
  return {
    publicToken: token,
    publicUrl: publicShootUrl(token),
  };
}

export type BookingWhen = "upcoming" | "past" | "all";

export function normalizeBookingWhen(value: unknown): BookingWhen {
  if (value === "upcoming" || value === "past" || value === "all") return value;
  return "all";
}

export function clampLimit(value: unknown, fallback = 50, max = 200) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function selectBookings<T extends { startsAt: Date; status: string; clientId: string }>(
  rows: T[],
  input: {
    now: Date;
    when: BookingWhen;
    includeCancelled?: boolean;
    clientId?: string;
    limit: number;
  },
) {
  const includeCancelled = input.includeCancelled === true;
  const filtered = rows.filter((row) => {
    if (!includeCancelled && row.status === "cancelled") return false;
    if (input.clientId && row.clientId !== input.clientId) return false;
    if (input.when === "upcoming") return row.startsAt.getTime() >= input.now.getTime();
    if (input.when === "past") return row.startsAt.getTime() < input.now.getTime();
    return true;
  });
  filtered.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return filtered.slice(0, input.limit);
}

export function confirmDeleteClient(inviteCode: string, confirmInviteCode: string) {
  const typed = confirmInviteCode.replace(/\s+/g, "").toUpperCase();
  if (typed !== inviteCode) {
    return "confirmInviteCode must match the client invite code.";
  }
  return null;
}
