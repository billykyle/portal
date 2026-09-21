import { parseRequiredDateKey, weekDateKeys } from "./horizon";

/** Date the times accordion should open first. Modify current day wins. */
export function initialExpandedDate(input: {
  suggestedDate?: string | null;
  currentDateKey?: string | null;
  datesWithSlots: Iterable<string>;
}): string | null {
  const dates = new Set(input.datesWithSlots);
  if (input.currentDateKey && dates.has(input.currentDateKey)) return input.currentDateKey;
  if (input.suggestedDate && dates.has(input.suggestedDate)) return input.suggestedDate;
  return [...dates].sort()[0] ?? null;
}

/** Keep the first week on screen unless the focus day is further out. */
export function initialWeekStart(input: {
  expandedDate: string | null;
  firstBookableDate: string;
  lastBookableDate: string;
}): string {
  if (!input.expandedDate) return input.firstBookableDate;
  const firstWeek = weekDateKeys(
    parseRequiredDateKey(input.firstBookableDate),
    parseRequiredDateKey(input.lastBookableDate),
  );
  if (firstWeek.includes(input.expandedDate)) return input.firstBookableDate;
  return input.expandedDate;
}
