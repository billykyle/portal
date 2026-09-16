import type { MediaType } from "./db/schema";

export const PHOTO_EXT = /\.(jpe?g|png|webp|heic|tif|tiff)$/i;
export const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
export const PLAN_FILE_EXT = /\.(jpe?g|png|webp|heic|tif|tiff|svg|pdf)$/i;

export type ListedNasEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

export type NasDeliverable = {
  name: string;
  path: string;
  type: MediaType;
};

export function isFloorPlanFolderName(name: string) {
  return /(floor\s*plans?|floorplans?|\bplans?\b)/i.test(name);
}

export function isVideoFolderName(name: string) {
  return /\bvideos?\b/i.test(name);
}

export function isImportablePhoto(name: string) {
  return PHOTO_EXT.test(name);
}

export function isImportableVideo(name: string) {
  return VIDEO_EXT.test(name);
}

export function isImportablePlan(name: string) {
  return PLAN_FILE_EXT.test(name);
}

export function guessMediaType(filename: string, folderHint = ""): MediaType {
  const lower = filename.toLowerCase();
  if (VIDEO_EXT.test(lower)) return "video";
  if (isFloorPlanFolderName(folderHint) || /(floor|plan)/.test(lower) || /\.svg$/.test(lower) || /\.pdf$/.test(lower)) {
    return "floor_plan";
  }
  return "photo";
}

export function selectStillsFolder<T extends { name: string }>(dirs: T[], preferred: string[]) {
  const wanted = preferred.map((name) => name.toLowerCase());
  return dirs.find((dir) => wanted.includes(dir.name.toLowerCase())) ?? null;
}

export function selectFloorPlanFolders<T extends { name: string }>(dirs: T[]) {
  return dirs.filter((dir) => isFloorPlanFolderName(dir.name));
}

export function selectVideoFolders<T extends { name: string }>(dirs: T[]) {
  return dirs.filter((dir) => isVideoFolderName(dir.name));
}

export function mediaImportFilename(
  filePath: string,
  fileName: string,
  shootFolderPath: string,
  stillsFolderPath: string | null,
) {
  const shoot = shootFolderPath.replace(/\/+$/, "");
  const stills = stillsFolderPath?.replace(/\/+$/, "") ?? null;
  const parent = filePath.slice(0, Math.max(0, filePath.length - fileName.length)).replace(/\/+$/, "");
  if (stills && parent === stills) return fileName;
  if (filePath === `${shoot}/${fileName}` || parent === shoot) return fileName;
  if (filePath.startsWith(`${shoot}/`)) return filePath.slice(shoot.length + 1);
  return fileName;
}

function visibleEntries(entries: ListedNasEntry[]) {
  return entries.filter((entry) => !entry.name.startsWith(".") && !entry.name.startsWith("_"));
}

async function collectMatchingFiles(
  dirPath: string,
  matches: (name: string) => boolean,
  list: (path: string) => ListedNasEntry[] | Promise<ListedNasEntry[]>,
) {
  const found: ListedNasEntry[] = [];
  const entries = visibleEntries(await Promise.resolve(list(dirPath)));
  for (const entry of entries) {
    if (entry.isDir) {
      found.push(...(await collectMatchingFiles(entry.path, matches, list)));
    } else if (matches(entry.name)) {
      found.push(entry);
    }
  }
  return found;
}

/**
 * Photos from Final/Photos (first preferred match), floor plans from Floor Plan
 * (and 3D Floorplan) including nested folders, videos from the shoot root and
 * any Video/Videos folder.
 */
export async function collectNasDeliverables(input: {
  shootFolderPath: string;
  stillsFolders: string[];
  list: (dirPath: string) => ListedNasEntry[] | Promise<ListedNasEntry[]>;
}): Promise<NasDeliverable[]> {
  const shoot = input.shootFolderPath.replace(/\/+$/, "");
  const entries = visibleEntries(await Promise.resolve(input.list(shoot)));
  const dirs = entries.filter((entry) => entry.isDir);
  const files = entries.filter((entry) => !entry.isDir);
  const stills = selectStillsFolder(dirs, input.stillsFolders);
  const out: NasDeliverable[] = [];
  const seen = new Set<string>();

  const push = (file: ListedNasEntry, type: MediaType, importName: string) => {
    if (seen.has(file.path)) return;
    seen.add(file.path);
    out.push({ name: importName, path: file.path, type });
  };

  if (stills) {
    const stillFiles = visibleEntries(await Promise.resolve(input.list(stills.path))).filter((entry) => !entry.isDir);
    for (const file of stillFiles) {
      if (!isImportablePhoto(file.name) && !isImportableVideo(file.name)) continue;
      push(file, guessMediaType(file.name, stills.name), file.name);
    }
  }

  for (const planDir of selectFloorPlanFolders(dirs)) {
    const planFiles = await collectMatchingFiles(planDir.path, isImportablePlan, input.list);
    for (const file of planFiles) {
      push(
        file,
        "floor_plan",
        mediaImportFilename(file.path, file.name, shoot, stills?.path ?? null),
      );
    }
  }

  for (const file of files) {
    if (!isImportableVideo(file.name)) continue;
    push(file, "video", file.name);
  }

  for (const videoDir of selectVideoFolders(dirs)) {
    const videoFiles = await collectMatchingFiles(videoDir.path, isImportableVideo, input.list);
    for (const file of videoFiles) {
      push(file, "video", mediaImportFilename(file.path, file.name, shoot, stills?.path ?? null));
    }
  }

  return out;
}
