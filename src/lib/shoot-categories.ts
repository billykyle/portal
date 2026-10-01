import { preferenceCookie } from "@/lib/shoot-sections";

/** Closed category sections on My Content and the admin client shoots list. Missing means open. */
export const SHOOT_CATEGORY_FOLDERS_COOKIE = "bk_shoot_categories";

export function categoryFolderName(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value;
}

export function groupShootsByCategoryFolder<T extends { categoryFolder?: string | null }>(
  shoots: readonly T[],
):
  | { grouped: false }
  | { grouped: true; ungrouped: T[]; categories: { name: string; shoots: T[] }[] } {
  if (!shoots.some((shoot) => categoryFolderName(shoot.categoryFolder))) return { grouped: false };
  const ungrouped: T[] = [];
  const buckets = new Map<string, T[]>();
  for (const shoot of shoots) {
    const name = categoryFolderName(shoot.categoryFolder);
    if (!name) {
      ungrouped.push(shoot);
      continue;
    }
    const list = buckets.get(name) ?? [];
    list.push(shoot);
    buckets.set(name, list);
  }
  const categories = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([name, items]) => ({ name, shoots: items }));
  return { grouped: true, ungrouped, categories };
}

function cookieCandidates(value: string) {
  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) candidates.push(decoded);
  } catch {
    // The stored value is already plain text.
  }
  return candidates;
}

export function parseClosedCategoryFolders(value: string | null | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  for (const candidate of cookieCandidates(value)) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      return new Set(
        parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0),
      );
    } catch {
      // Try the decoded form next.
    }
  }
  return new Set();
}

export function serializeClosedCategoryFolders(names: Iterable<string>) {
  const list = [...names].filter((name) => name.trim().length > 0).sort((a, b) => a.localeCompare(b));
  if (list.length === 0) return "";
  return JSON.stringify(list);
}

export function categoryFoldersCookie(value: string, secure = false) {
  return preferenceCookie(SHOOT_CATEGORY_FOLDERS_COOKIE, value, secure);
}

export function categoryFolderStartsOpen(closed: ReadonlySet<string>, name: string) {
  return !closed.has(name);
}
