import { uniqueFolderName } from "@/lib/upload/names";

export const MOVE_CHUNK_BYTES = 8 * 1024 * 1024;
export const MOVE_LOCK_MS = 15 * 60 * 1000;

export type MoveFile = {
  id: string;
  safeName: string;
  size: number;
  blobPathname: string;
  copiedBytes: number;
};

export type MoveDeps = {
  locate: () => Promise<{ ok: true; path: string } | { ok: false; reason: string }>;
  listNames: (dir: string) => Promise<string[]>;
  mkdir: (path: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  writeChunk: (input: {
    dir: string;
    name: string;
    totalSize: number;
    begin: number;
    bytes: Uint8Array;
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readChunk: (input: { pathname: string; begin: number; length: number }) => Promise<Uint8Array>;
  statSize: (dir: string, name: string) => Promise<number | null>;
  deleteBlob: (pathname: string) => Promise<void>;
  /** How many bytes to copy in this pass. The cron continues on the next run. */
  budgetBytes?: number;
};

export type MoveResult =
  | {
      status: "stored";
      folderName: string;
      nasPath: string;
      deleted: string[];
    }
  | {
      status: "partial";
      folderName: string;
      nasPath: string;
      copied: Array<{ id: string; copiedBytes: number }>;
    }
  | {
      status: "failed";
      reason: string;
      folderName: string;
      nasPath: string;
      copied: Array<{ id: string; copiedBytes: number }>;
    };

export function moveLockExpired(updatedAt: Date, now = new Date()) {
  return now.getTime() - updatedAt.getTime() >= MOVE_LOCK_MS;
}

export function notificationFor(
  result: MoveResult,
  flags: { receivedNotifiedAt: Date | null; failureNotifiedAt: Date | null },
): "received" | "failed" | "none" {
  if (result.status === "stored" && !flags.receivedNotifiedAt) return "received";
  if (result.status === "failed" && !flags.failureNotifiedAt) return "failed";
  return "none";
}

export async function moveSubmission(input: {
  /** Reserved at submit time. A NAS collision renames it to `name-2`. */
  folderName: string;
  files: MoveFile[];
  deps: MoveDeps;
}): Promise<MoveResult> {
  const copiedNow = () => input.files.map((file) => ({ id: file.id, copiedBytes: file.copiedBytes }));
  const located = await input.deps.locate();
  if (!located.ok) {
    return {
      status: "failed",
      reason: located.reason,
      folderName: input.folderName,
      nasPath: "",
      copied: copiedNow(),
    };
  }

  let existing: string[] = [];
  try {
    existing = await input.deps.listNames(located.path);
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Could not list the upload folder.",
      folderName: input.folderName,
      nasPath: located.path,
      copied: copiedNow(),
    };
  }

  const started = input.files.some((file) => file.copiedBytes > 0);
  let folderName = input.folderName;
  if (existing.includes(folderName) && !started) {
    folderName = uniqueFolderName(folderName, existing);
  }
  const nasPath = `${located.path.replace(/\/+$/, "")}/${folderName}`;
  if (!existing.includes(folderName)) {
    const made = await input.deps.mkdir(nasPath);
    if (!made.ok) {
      return {
        status: "failed",
        reason: made.reason,
        folderName,
        nasPath,
        copied: copiedNow(),
      };
    }
  }

  const budget = input.deps.budgetBytes ?? Number.POSITIVE_INFINITY;
  let spent = 0;
  const copied = input.files.map((file) => ({ id: file.id, copiedBytes: file.copiedBytes }));

  for (const file of input.files) {
    let cursor = file.copiedBytes;
    while (cursor < file.size) {
      if (spent >= budget) {
        return { status: "partial", folderName, nasPath, copied };
      }
      const length = Math.min(MOVE_CHUNK_BYTES, file.size - cursor, budget - spent);
      let bytes: Uint8Array;
      try {
        bytes = await input.deps.readChunk({ pathname: file.blobPathname, begin: cursor, length });
      } catch (error) {
        return {
          status: "failed",
          reason: error instanceof Error ? error.message : "Could not read the staged file.",
          folderName,
          nasPath,
          copied,
        };
      }
      if (bytes.byteLength !== length) {
        return {
          status: "failed",
          reason: `Staged file ${file.safeName} returned ${bytes.byteLength} bytes at offset ${cursor}.`,
          folderName,
          nasPath,
          copied,
        };
      }
      const wrote = await input.deps.writeChunk({
        dir: nasPath,
        name: file.safeName,
        totalSize: file.size,
        begin: cursor,
        bytes,
      });
      if (!wrote.ok) {
        return { status: "failed", reason: wrote.reason, folderName, nasPath, copied };
      }
      cursor += bytes.byteLength;
      spent += bytes.byteLength;
      const row = copied.find((item) => item.id === file.id);
      if (row) row.copiedBytes = cursor;
    }
  }

  const deleted: string[] = [];
  for (const file of input.files) {
    const size = await input.deps.statSize(nasPath, file.safeName);
    if (size !== file.size) {
      return {
        status: "failed",
        reason: `Size check failed for ${file.safeName}. Expected ${file.size} bytes, found ${size ?? "nothing"}.`,
        folderName,
        nasPath,
        copied,
      };
    }
  }
  for (const file of input.files) {
    await input.deps.deleteBlob(file.blobPathname);
    deleted.push(file.blobPathname);
  }
  return { status: "stored", folderName, nasPath, deleted };
}
