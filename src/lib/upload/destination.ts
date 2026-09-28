import { del, head } from "@vercel/blob";
import { isNasDirectory, listNasDir, nasSharePost } from "@/lib/nas";
import { NAS_UPLOADS_PATH } from "@/lib/upload/names";
import type { MoveDeps } from "@/lib/upload/move";

/** The configured Uploads directory. Never creates it. */
export async function locateNasUploadFolder(): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  try {
    await listNasDir(NAS_UPLOADS_PATH);
    return { ok: true, path: NAS_UPLOADS_PATH };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not read the NAS.";
    return { ok: false, reason: `${NAS_UPLOADS_PATH}: ${reason}` };
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
