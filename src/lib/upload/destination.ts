import { del, head } from "@vercel/blob";
import {
  isHiddenNasName,
  isNasDirectory,
  listNasDir,
  nasSharePost,
  nasShareRoot,
  type NasFile,
} from "@/lib/nas";
import { NAS_UPLOAD_DIR_NAME, findUploadDirectory } from "@/lib/upload/names";
import type { MoveDeps } from "@/lib/upload/move";

function asListing(entries: NasFile[]) {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    isDir: isNasDirectory(entry),
  }));
}

/** Existing folder named `upload`, matched case-sensitively. Never creates one. */
export async function locateNasUploadFolder(): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const override = process.env.NAS_UPLOAD_PATH?.trim() ?? "";
  if (override) {
    if (!override.startsWith("/") || override.split("/").includes("..")) {
      return { ok: false, reason: "NAS_UPLOAD_PATH must be an absolute path." };
    }
    return { ok: true, path: override.replace(/\/+$/, "") };
  }
  try {
    const root = await nasShareRoot();
    const top = asListing(await listNasDir(root));
    const direct = findUploadDirectory(top);
    if (direct) return { ok: true, path: direct.path };
    for (const child of top) {
      if (!child.isDir || isHiddenNasName(child.name)) continue;
      const nested = findUploadDirectory(asListing(await listNasDir(child.path)));
      if (nested) return { ok: true, path: nested.path };
    }
    return { ok: false, reason: `No folder named ${NAS_UPLOAD_DIR_NAME} on the NAS share (${root}).` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not read the NAS." };
  }
}

export async function listNasChildNames(dir: string) {
  const entries = await listNasDir(dir);
  return entries.map((entry) => entry.name);
}

export async function mkdirNas(path: string) {
  try {
    const result = await nasSharePost("filemgr/createFolder", { path });
    if (result.code === 200) return { ok: true as const };
    return {
      ok: false as const,
      reason: `NAS could not create the folder (${result.code} ${result.msg}). The share session has no write token.`,
    };
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : "NAS create failed." };
  }
}

export async function nasChildSize(dir: string, name: string) {
  const entries = await listNasDir(dir);
  const file = entries.find((entry) => entry.name === name && !isNasDirectory(entry));
  return file ? file.size : null;
}

/**
 * The connected UGOS share can list and download. Creating a folder and writing
 * bytes need a user token the share login does not return, so this refuses
 * before any file body is sent. A later credential can replace this function.
 */
export async function writeNasChunk(): Promise<{ ok: false; reason: string }> {
  return {
    ok: false,
    reason: "The NAS share session cannot write file bytes. Files stay in cloud storage.",
  };
}

/** Read one range from a private blob. Only called after the NAS folder exists. */
export async function readBlobChunk(input: { pathname: string; begin: number; length: number }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("Cloud storage is not configured.");
  const meta = await head(input.pathname);
  const res = await fetch(meta.url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Range: `bytes=${input.begin}-${input.begin + input.length - 1}`,
    },
  });
  if (res.status !== 200 && res.status !== 206) {
    throw new Error(`Could not read the staged file (${res.status}).`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function liveMoveDeps(): MoveDeps {
  return {
    locate: locateNasUploadFolder,
    listNames: listNasChildNames,
    mkdir: mkdirNas,
    writeChunk: writeNasChunk,
    readChunk: readBlobChunk,
    statSize: nasChildSize,
    deleteBlob: async (pathname) => {
      await del(pathname);
    },
    budgetBytes: 32 * 1024 * 1024,
  };
}
