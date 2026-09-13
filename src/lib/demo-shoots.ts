const DEMO_ADDRESSES = new Set([
  "1847 Maple Avenue, Austin, TX",
  "412 West 12th Street, Unit 6B, Austin, TX",
]);

export function isPlaceholderMediaUrl(url: string | null | undefined) {
  return Boolean(url?.startsWith("/samples/"));
}

export function isPortalOnlyDemoShoot(input: {
  address: string;
  nasRelativePath: string | null;
  dropboxUrl?: string | null;
  mediaUrls?: string[];
}) {
  if (input.mediaUrls?.some((url) => isPlaceholderMediaUrl(url))) return true;
  if (input.nasRelativePath?.startsWith("Whitfield/")) return true;
  if (DEMO_ADDRESSES.has(input.address)) return true;
  if (input.dropboxUrl?.includes("placeholder")) return true;
  return false;
}

export function mediaFilenamesMissingFromNas(
  existing: Array<{ filename: string }>,
  nasFilenames: Set<string>,
) {
  return existing.filter((row) => !nasFilenames.has(row.filename)).map((row) => row.filename);
}

export function shouldPruneShootsMissingFromNas(listedClientFolders: number) {
  return listedClientFolders > 0;
}

export function shouldCreatePortalShoot(nasStillCount: number) {
  return nasStillCount > 0;
}
