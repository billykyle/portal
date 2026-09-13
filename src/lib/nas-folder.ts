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

export function clientFolderRelPath(clientName: string, shootFolderName: string) {
  return `${clientName}/${shootFolderName}`;
}
