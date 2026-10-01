/** `{2026.09.04|2026-09-04} - {address}` under a client folder. */
const SHOOT_FOLDER = /^(\d{4})[.\-](\d{2})[.\-](\d{2})\s+-\s+(.+)$/;

export type ParsedShootFolder = {
  shotDate: string;
  address: string;
  folderName: string;
};

export function parseShootFolderName(name: string): ParsedShootFolder | null {
  const trimmed = name.trim();
  const match = trimmed.match(SHOOT_FOLDER);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const address = match[4].trim();
  if (!address || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    shotDate: `${match[1]}-${match[2]}-${match[3]}`,
    address,
    folderName: trimmed,
  };
}

export function pendingClientEmail(displayName: string) {
  const slug =
    displayName
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || "client";
  return `${slug}@pending.local`;
}

export function clientFolderRelPath(
  clientName: string,
  shootFolderName: string,
  categoryFolder?: string | null,
) {
  const category = categoryFolder?.trim() ? categoryFolder : null;
  if (category) return `${clientName}/${category}/${shootFolderName}`;
  return `${clientName}/${shootFolderName}`;
}

/**
 * Deliverable folders that can sit on a client by mistake.
 * Exact names only, plus whatever stills folders the share is configured to use.
 * A category Billy named himself (Construction, Listing Photography) is not in this set.
 */
const CLIENT_DELIVERABLE_FOLDERS = new Set([
  "photos",
  "photo",
  "floor plans",
  "floor plan",
  "floorplans",
  "floorplan",
  "final",
  "video",
  "videos",
  "raw video",
  "raw videos",
  "raw-video",
  "raw_video",
]);

export function isClientLevelDeliverableFolder(name: string, stillsFolders: readonly string[]) {
  const key = name.trim().toLowerCase();
  if (CLIENT_DELIVERABLE_FOLDERS.has(key)) return true;
  return stillsFolders.some((folder) => folder.trim().toLowerCase() === key);
}

export type PlannedNasShoot = {
  shotDate: string;
  address: string;
  folderName: string;
  categoryFolder: string | null;
  nasRelativePath: string;
};

export type ClientFolderChild = {
  name: string;
  /** Direct children when this folder was opened one level. Omit for shoots and skipped deliverable names. */
  inner?: readonly { name: string }[];
};

/**
 * One level under a client folder.
 * A dated child is a shoot with no category. Anything else is a category folder
 * whose dated children are shoots. Deliverable names and empty categories are skipped.
 * The same shot date and address keeps one shoot; the later folder wins.
 */
export function classifyClientChildren(input: {
  clientName: string;
  stillsFolders: readonly string[];
  children: readonly ClientFolderChild[];
}): { shoots: PlannedNasShoot[]; warnings: string[] } {
  const shoots: PlannedNasShoot[] = [];
  const warnings: string[] = [];
  const indexByIdentity = new Map<string, number>();

  function place(shoot: PlannedNasShoot) {
    const key = `${shoot.shotDate}\0${shoot.address}`;
    const existing = indexByIdentity.get(key);
    if (existing === undefined) {
      indexByIdentity.set(key, shoots.length);
      shoots.push(shoot);
      return;
    }
    shoots[existing] = shoot;
  }

  for (const child of input.children) {
    if (isClientLevelDeliverableFolder(child.name, input.stillsFolders)) continue;

    const parsed = parseShootFolderName(child.name);
    if (parsed) {
      place({
        shotDate: parsed.shotDate,
        address: parsed.address,
        folderName: parsed.folderName,
        categoryFolder: null,
        nasRelativePath: clientFolderRelPath(input.clientName, parsed.folderName),
      });
      continue;
    }

    const inner = child.inner ?? [];
    const dated = inner.flatMap((entry) => {
      const shoot = parseShootFolderName(entry.name);
      return shoot ? [shoot] : [];
    });
    if (dated.length > 0) {
      for (const shoot of dated) {
        place({
          shotDate: shoot.shotDate,
          address: shoot.address,
          folderName: shoot.folderName,
          categoryFolder: child.name,
          nasRelativePath: clientFolderRelPath(input.clientName, shoot.folderName, child.name),
        });
      }
      continue;
    }

    if (inner.length === 0) continue;
    warnings.push(
      `Skipped ${input.clientName}/${child.name} — expected "{date} - {address}".`,
    );
  }

  return { shoots, warnings };
}

export type NasShootPlacement = {
  clientId: string;
  shotDate: string;
  address: string;
  nasRelativePath: string;
  categoryFolder: string | null;
};

export type StoredNasShoot = NasShootPlacement & { id: string };

/** Match client + shot date + address. A moved folder updates that row's path and category. */
export function applyNasShootIdentity(
  rows: readonly StoredNasShoot[],
  next: NasShootPlacement,
  newId: string,
): StoredNasShoot[] {
  const index = rows.findIndex(
    (row) =>
      row.clientId === next.clientId && row.shotDate === next.shotDate && row.address === next.address,
  );
  if (index === -1) return [...rows, { ...next, id: newId }];
  return rows.map((row, i) =>
    i === index
      ? { ...row, nasRelativePath: next.nasRelativePath, categoryFolder: next.categoryFolder }
      : row,
  );
}
