export const ZIP_MEDIA_TYPES = ["photo", "floor_plan", "video"] as const;
export type ZipMediaType = (typeof ZIP_MEDIA_TYPES)[number];

export type TypedDownloadFile = {
  url: string;
  filename: string;
  type: ZipMediaType;
};

export function zipTypeLabel(type: string) {
  if (type === "floor_plan") return "Floor plans";
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

export function zipDownloadOptions(present: ZipMediaType[]) {
  const options: Array<{ id: "all" | ZipMediaType; label: string }> = [];
  if (present.length > 1) {
    options.push({ id: "all", label: "Everything" });
  }
  for (const type of present) {
    options.push({ id: type, label: zipTypeLabel(type) });
  }
  return options;
}

export function withZipTypes(zipUrl: string, types: ZipMediaType[] | "all") {
  if (types === "all") return zipUrl;
  const query = `types=${types.join(",")}`;
  return zipUrl.includes("?") ? `${zipUrl}&${query}` : `${zipUrl}?${query}`;
}

export function typesFromScope(scope: "all" | ZipMediaType): ZipMediaType[] | "all" {
  return scope === "all" ? "all" : [scope];
}
