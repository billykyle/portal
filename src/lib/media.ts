import type { Media } from "./db/schema";
import { isNasFilePath, nasEnabled } from "./nas-flags";

export { guessMediaType } from "./nas-media";

export function joinUrl(base: string, relativePath: string) {
  const trimmed = base.replace(/\/+$/, "");
  const encoded = relativePath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${trimmed}/${encoded}`;
}

export function isNasBacked(item: Pick<Media, "id" | "nasRelativePath">) {
  return nasEnabled() && isNasFilePath(item.nasRelativePath);
}

export function resolveMediaUrl(item: Pick<Media, "id" | "url" | "nasRelativePath">) {
  if (isNasBacked(item)) return `/api/media/${item.id}`;
  return item.url;
}

export function resolveMediaThumbUrl(item: Pick<Media, "id" | "url" | "nasRelativePath">) {
  if (isNasBacked(item)) return `/api/media/${item.id}/thumb`;
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

export function mediaSectionId(type: string) {
  if (type === "floor_plan") return "floor-plans";
  if (type === "video") return "video";
  return "photos";
}

export function isPdfFilename(filename: string) {
  return /\.pdf$/i.test(filename);
}
