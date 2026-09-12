import type { Media } from "./db/schema";

export function joinUrl(base: string, relativePath: string) {
  const trimmed = base.replace(/\/+$/, "");
  const encoded = relativePath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${trimmed}/${encoded}`;
}

export function resolveMediaUrl(item: Pick<Media, "url" | "nasRelativePath">) {
  const base = process.env.NAS_BASE_URL?.trim();
  const useNas = process.env.NAS_ENABLED === "true";
  if (useNas && base && item.nasRelativePath) {
    return joinUrl(base, item.nasRelativePath);
  }
  return item.url;
}

export function formatShootDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shootFolderName(shotDate: string, address: string) {
  return `${shotDate} - ${address}`;
}

export function mediaLabel(type: string) {
  if (type === "floor_plan") return "Floor plans";
  if (type === "video") return "Video";
  return "Photos";
}
