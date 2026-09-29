import {
  parseClosedShootSections,
  preferenceCookie,
  serializeClosedShootSections,
} from "@/lib/shoot-sections";

/** Section types shown as a file list. Missing means grid. One choice per section type. */
export const SHOOT_LAYOUT_COOKIE = "bk_shoot_layout";

export type SectionLayout = "grid" | "list";

export function parseListShootSections(value: string | null | undefined) {
  return parseClosedShootSections(value);
}

export function serializeListShootSections(ids: Iterable<string>) {
  return serializeClosedShootSections(ids);
}

export function shootLayoutCookie(value: string, secure = false) {
  return preferenceCookie(SHOOT_LAYOUT_COOKIE, value, secure);
}

export function shootSectionLayout(listIds: ReadonlySet<string>, id: string): SectionLayout {
  return listIds.has(id) ? "list" : "grid";
}
