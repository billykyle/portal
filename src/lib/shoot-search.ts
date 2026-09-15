import { formatShootDate } from "./media";

export type ShootSearchFields = {
  address: string;
  shotDate: string;
  dateLabel?: string;
};

function dateSearchExtras(shotDate: string) {
  const [year, month, day] = shotDate.split("-");
  if (!year || !month || !day) return [];
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return [];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return [
    utc.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    `${m}/${d}/${y}`,
    `${month}/${day}/${year}`,
    `${m}/${d}`,
    shotDate.replaceAll("-", "/"),
    shotDate.replaceAll("-", ""),
  ];
}

export function shootSearchHaystack(shoot: ShootSearchFields) {
  const dateLabel = shoot.dateLabel ?? formatShootDate(shoot.shotDate);
  return [shoot.address, shoot.shotDate, dateLabel, ...dateSearchExtras(shoot.shotDate)]
    .join(" ")
    .toLowerCase();
}

/** Keeps the incoming order (newest first from the page query). */
export function filterShoots<T extends ShootSearchFields>(shoots: readonly T[], query: string): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...shoots];
  return shoots.filter((shoot) => {
    const haystack = shootSearchHaystack(shoot);
    return tokens.every((token) => haystack.includes(token));
  });
}
