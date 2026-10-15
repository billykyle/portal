import { isZipExcludedVideo, videoOmissionNote } from "./mux-policy";

export const ZIP_MEDIA_TYPES = ["photo", "floor_plan", "video", "raw_video"] as const;
export type ZipMediaType = (typeof ZIP_MEDIA_TYPES)[number];

export type TypedDownloadFile = {
  url: string;
  filename: string;
  type: ZipMediaType;
};

export function zipTypeLabel(type: string) {
  if (type === "floor_plan") return "Floor plans";
  if (type === "raw_video") return "Raw video";
  if (type === "video") return "Video";
  return "Photos";
}

export function presentMediaTypes(files: Array<{ type?: string }>): ZipMediaType[] {
  return ZIP_MEDIA_TYPES.filter((type) => files.some((file) => file.type === type));
}

export function parseZipTypesParam(value: string | null | undefined): ZipMediaType[] | "all" {
  if (!value || value === "all") return "all";
  const requested = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is ZipMediaType => (ZIP_MEDIA_TYPES as readonly string[]).includes(part));
  return requested.length > 0 ? requested : "all";
}

export function filterFilesByZipTypes<T extends { type?: string }>(
  files: T[],
  types: ZipMediaType[] | "all",
) {
  if (types === "all") return files;
  const allowed = new Set(types);
  return files.filter((file) => file.type && allowed.has(file.type as ZipMediaType));
}

export function zipScopeFolderName(
  folderName: string,
  types: ZipMediaType[] | "all",
  present: ZipMediaType[],
) {
  if (types === "all" || types.length === 0 || types.length === present.length) {
    return folderName;
  }
  return `${folderName} - ${types.map((type) => zipTypeLabel(type)).join(" + ")}`;
}

/** Photos and floor plans stay in the zip. Video is downloaded on its own. */
export function zipStillTypes(present: readonly ZipMediaType[]) {
  return present.filter((type) => !isZipExcludedVideo(type));
}

export function zipDownloadOptions(present: ZipMediaType[]) {
  const stills = zipStillTypes(present);
  const options: Array<{ id: "all" | ZipMediaType; label: string }> = [];
  if (stills.length > 1) {
    options.push({ id: "all", label: "Everything" });
  }
  for (const type of stills) {
    options.push({ id: type, label: zipTypeLabel(type) });
  }
  return options;
}

export function partitionZipFiles<T extends { type?: string; filename: string }>(files: readonly T[]) {
  const included: T[] = [];
  const omitted: T[] = [];
  for (const file of files) {
    if (isZipExcludedVideo(file.type)) omitted.push(file);
    else included.push(file);
  }
  const note =
    omitted.length > 0
      ? { filename: "VIDEOS.txt", text: videoOmissionNote(omitted.map((file) => file.filename)) }
      : null;
  return { files: included, omitted, note };
}

export function withZipTypes(zipUrl: string, types: ZipMediaType[] | "all") {
  if (types === "all") return zipUrl;
  const query = `types=${types.join(",")}`;
  return zipUrl.includes("?") ? `${zipUrl}&${query}` : `${zipUrl}?${query}`;
}

export function typesFromScope(scope: "all" | ZipMediaType): ZipMediaType[] | "all" {
  return scope === "all" ? "all" : [scope];
}
