import { parseInviteSequence } from "@/lib/invite";

/** Stored in a cookie. Kept out of the admin clients URL. */
export const CLIENT_SORT_COOKIE = "bk_client_sort";

export const CLIENT_SORTS = [
  "name-asc",
  "name-desc",
  "company",
  "newest",
  "oldest",
  "shoots",
  "code",
] as const;

export type ClientSort = (typeof CLIENT_SORTS)[number];

export const DEFAULT_CLIENT_SORT: ClientSort = "name-asc";

export const CLIENT_SORT_LABELS: Record<ClientSort, string> = {
  "name-asc": "Name A to Z",
  "name-desc": "Name Z to A",
  company: "Company A to Z",
  newest: "Newest added",
  oldest: "Oldest added",
  shoots: "Most shoots",
  code: "Invite code",
};

const CLIENT_SORT_SET = new Set<string>(CLIENT_SORTS);

export function isClientSort(value: string): value is ClientSort {
  return CLIENT_SORT_SET.has(value);
}

export function parseClientSort(value: string | null | undefined): ClientSort {
  if (!value) return DEFAULT_CLIENT_SORT;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return isClientSort(decoded) ? decoded : DEFAULT_CLIENT_SORT;
}

/** Optional agent `sort`. Omitted, null, and "" keep the caller's existing order. */
export function readClientSortArgument(
  value: unknown,
): { ok: true; sort?: ClientSort } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true };
  if (typeof value === "string" && isClientSort(value)) return { ok: true, sort: value };
  return {
    ok: false,
    error: "Sort must be name-asc, name-desc, company, newest, oldest, shoots, or code.",
  };
}

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function clientSortCookie(value: ClientSort, secure = false) {
  const parts = [
    `${CLIENT_SORT_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export type SortableClient = {
  displayName: string;
  company?: string | null;
  inviteCode: string;
  createdAt: Date | string;
  shootCount: number;
};

function compareText(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), "en", { sensitivity: "base" });
}

function companyName(company: string | null | undefined) {
  const text = String(company ?? "").trim();
  return text || null;
}

function timestamp(value: Date | string) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function compareClients(sort: ClientSort, left: SortableClient, right: SortableClient) {
  switch (sort) {
    case "name-asc":
      return compareText(left.displayName, right.displayName);
    case "name-desc":
      return compareText(right.displayName, left.displayName);
    case "company": {
      const leftCompany = companyName(left.company);
      const rightCompany = companyName(right.company);
      if (!leftCompany && !rightCompany) return 0;
      if (!leftCompany) return 1;
      if (!rightCompany) return -1;
      return compareText(leftCompany, rightCompany);
    }
    case "newest":
      return timestamp(right.createdAt) - timestamp(left.createdAt);
    case "oldest":
      return timestamp(left.createdAt) - timestamp(right.createdAt);
    case "shoots":
      return right.shootCount - left.shootCount;
    case "code": {
      const leftCode = parseInviteSequence(left.inviteCode);
      const rightCode = parseInviteSequence(right.inviteCode);
      if (leftCode === null && rightCode === null) return 0;
      if (leftCode === null) return 1;
      if (rightCode === null) return -1;
      return leftCode - rightCode;
    }
  }
}

/** Case-insensitive, stable sort. Does not mutate `rows`. */
export function sortClients<T extends SortableClient>(rows: readonly T[], sort: ClientSort): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = compareClients(sort, left.row, right.row);
      if (compared !== 0) return compared;
      return left.index - right.index;
    })
    .map((entry) => entry.row);
}
