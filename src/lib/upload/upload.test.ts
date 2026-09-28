import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_BOOKING_NOTIFY_EMAIL } from "@/lib/email";
import { filesReceivedMessage, formatBytes, moveFailedMessage } from "@/lib/upload/mail";
import { moveSubmission, MOVE_CHUNK_BYTES, notificationFor } from "@/lib/upload/move";
import {
  findUploadDirectory,
  NAS_UPLOAD_DIR_NAME,
  sanitizeFileName,
  sanitizeUploadLabel,
  submissionFolderBase,
  uniqueFileName,
  uniqueFolderName,
  uploadBlobPath,
  uploadDay,
} from "@/lib/upload/names";
import {
  consumeUploadRate,
  DEFAULT_UPLOAD_MAX_BYTES,
  parseUploadRequest,
  resetUploadRateForTests,
  UPLOAD_RATE_LIMIT,
} from "@/lib/upload/policy";
import { authorizeBlobUpload } from "@/lib/upload/token";

afterEach(() => {
  resetUploadRateForTests();
  delete process.env.UPLOAD_MAX_BYTES;
});

test("upload day is the America/New_York calendar date", () => {
  assert.equal(uploadDay(new Date("2026-09-28T03:30:00Z")), "2026-09-27");
  assert.equal(uploadDay(new Date("2026-09-28T04:30:00Z")), "2026-09-28");
});

test("labels, file names, and folder names stay a single safe segment", () => {
  assert.deepEqual(sanitizeUploadLabel("  Headshots  "), { ok: true, value: "Headshots" });
  assert.equal(sanitizeUploadLabel("   ").ok, false);
  assert.equal(sanitizeUploadLabel("a".repeat(81)).ok, false);
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFileName("..\\notes?.pdf"), "notes.pdf");
  assert.equal(sanitizeFileName("   "), "file");
  assert.equal(uniqueFileName("a.jpg", ["a.jpg"]), "a-2.jpg");
  assert.equal(uniqueFileName("a.jpg", ["a.jpg", "a-2.jpg"]), "a-3.jpg");
  const base = submissionFolderBase({
    day: "2026-09-28",
    label: "Headshots",
    email: "guest@example.com",
  });
  assert.equal(base, "2026-09-28 Headshots - guest@example.com");
  assert.equal(uniqueFolderName(base, []), base);
  assert.equal(uniqueFolderName(base, [base]), `${base}-2`);
  assert.equal(uniqueFolderName(base, [base, `${base}-2`]), `${base}-3`);
  assert.equal(uploadBlobPath("sub", "file", "a.jpg"), "uploads/sub/file/a.jpg");
  assert.equal(
    findUploadDirectory([
      { name: "Upload", path: "/share/Upload", isDir: true },
      { name: NAS_UPLOAD_DIR_NAME, path: "/share/upload", isDir: true },
    ])?.path,
    "/share/upload",
  );
  assert.equal(findUploadDirectory([{ name: "upload", path: "/share/upload", isDir: false }]), null);
});

test("request validation requires a label, a real email, and sized files", () => {
  const ok = parseUploadRequest(
    {
      label: " Selects ",
      email: "Guest@Example.com",
      files: [
        { name: "../a.jpg", size: 10 },
        { name: "a.jpg", size: 20 },
      ],
    },
    { maxBytes: 100, maxFiles: 5, maxTotalBytes: 100 },
  );
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.email, "guest@example.com");
  assert.equal(ok.label, "Selects");
  assert.deepEqual(
    ok.files.map((file) => file.safeName),
    ["a.jpg", "a-2.jpg"],
  );
  assert.equal(parseUploadRequest({ label: "", email: "a@b.co", files: [{ name: "a", size: 1 }] }).ok, false);
  assert.equal(parseUploadRequest({ label: "Cut", email: "not-an-email", files: [{ name: "a", size: 1 }] }).ok, false);
  assert.equal(parseUploadRequest({ label: "Cut", email: "a@pending.local", files: [{ name: "a", size: 1 }] }).ok, false);
  assert.equal(parseUploadRequest({ label: "Cut", email: "a@b.co", files: [] }).ok, false);
  assert.equal(
    parseUploadRequest({ label: "Cut", email: "a@b.co", files: [{ name: "a", size: 101 }] }, {
      maxBytes: 100,
      maxFiles: 5,
      maxTotalBytes: 1000,
    }).ok,
    false,
  );
  assert.equal(DEFAULT_UPLOAD_MAX_BYTES, 50 * 1024 * 1024 * 1024);
});

test("rate limit allows a handful of submissions per hour", () => {
  for (let i = 0; i < UPLOAD_RATE_LIMIT; i += 1) {
    assert.equal(consumeUploadRate("198.51.100.8", 1_000).ok, true);
  }
  const blocked = consumeUploadRate("198.51.100.8", 1_000);
  assert.equal(blocked.ok, false);
  assert.equal(consumeUploadRate("198.51.100.9", 1_000).ok, true);
});

test("blob tokens only match the reserved pathname", () => {
  const files = [{ id: "file-1", blobPathname: "uploads/sub/file-1/a.jpg", sizeBytes: 12, status: "pending" }];
  assert.deepEqual(
    authorizeBlobUpload({
      pathname: "uploads/sub/file-1/a.jpg",
      clientPayload: JSON.stringify({ submissionId: "sub", fileId: "file-1" }),
      submissionStatus: "open",
      files,
    }),
    { ok: true, sizeBytes: 12 },
  );
  assert.equal(
    authorizeBlobUpload({
      pathname: "uploads/other/a.jpg",
      clientPayload: JSON.stringify({ fileId: "file-1" }),
      submissionStatus: "open",
      files,
    }).ok,
    false,
  );
  assert.equal(
    authorizeBlobUpload({
      pathname: files[0].blobPathname,
      clientPayload: JSON.stringify({ fileId: "file-1" }),
      submissionStatus: "staged",
      files,
    }).ok,
    false,
  );
});

function memoryDeps(options?: {
  uploadPath?: string;
  existing?: string[];
  mkdir?: { ok: true } | { ok: false; reason: string };
  stat?: number | null;
  budgetBytes?: number;
}) {
  const store = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const reads: number[] = [];
  const deps = {
    locate: async () =>
      options?.uploadPath === ""
        ? { ok: false as const, reason: "No folder named upload on the NAS share." }
        : { ok: true as const, path: options?.uploadPath ?? "/share/upload" },
    listNames: async () => options?.existing ?? [],
    mkdir: async () => options?.mkdir ?? { ok: true as const },
    readChunk: async ({ begin, length }: { begin: number; length: number }) => {
      reads.push(begin);
      return new Uint8Array(length).fill(7);
    },
    writeChunk: async ({
      name,
      begin,
      bytes,
    }: {
      name: string;
      begin: number;
      bytes: Uint8Array;
    }) => {
      const current = store.get(name) ?? new Uint8Array(0);
      const next = new Uint8Array(begin + bytes.byteLength);
      next.set(current.subarray(0, begin));
      next.set(bytes, begin);
      store.set(name, next);
      return { ok: true as const };
    },
    statSize: async (_dir: string, name: string) => {
      if (options && "stat" in options) return options.stat ?? null;
      return store.get(name)?.byteLength ?? null;
    },
    deleteBlob: async (pathname: string) => {
      deleted.push(pathname);
    },
    budgetBytes: options?.budgetBytes,
  };
  return { deps, store, deleted, reads };
}

test("a finished copy verifies size, deletes blobs, and names the NAS folder", async () => {
  const { deps, deleted } = memoryDeps();
  const result = await moveSubmission({
    folderName: "2026-09-28 Headshots - guest@example.com",
    files: [
      {
        id: "1",
        safeName: "a.jpg",
        size: 4,
        blobPathname: "uploads/sub/1/a.jpg",
        copiedBytes: 0,
      },
    ],
    deps,
  });
  assert.equal(result.status, "stored");
  if (result.status !== "stored") return;
  assert.equal(result.nasPath, "/share/upload/2026-09-28 Headshots - guest@example.com");
  assert.deepEqual(deleted, ["uploads/sub/1/a.jpg"]);
  assert.equal(notificationFor(result, { receivedNotifiedAt: null, failureNotifiedAt: null }), "received");
});

test("an existing NAS folder is kept by appending -2 and blobs stay when mkdir fails", async () => {
  const base = "2026-09-28 Headshots - guest@example.com";
  const blocked = memoryDeps({
    existing: [base],
    mkdir: { ok: false, reason: "NAS could not create the folder (1010 Token cannot be empty!)." },
  });
  const failed = await moveSubmission({
    folderName: base,
    files: [{ id: "1", safeName: "a.jpg", size: 4, blobPathname: "uploads/a", copiedBytes: 0 }],
    deps: blocked.deps,
  });
  assert.equal(failed.status, "failed");
  if (failed.status !== "failed") return;
  assert.equal(failed.folderName, `${base}-2`);
  assert.equal(blocked.deleted.length, 0);
  assert.equal(blocked.reads.length, 0);
  assert.equal(notificationFor(failed, { receivedNotifiedAt: null, failureNotifiedAt: null }), "failed");
  assert.equal(notificationFor(failed, { receivedNotifiedAt: null, failureNotifiedAt: new Date() }), "none");
});

test("a size mismatch keeps the blob", async () => {
  const { deps, deleted } = memoryDeps({ stat: 1 });
  const result = await moveSubmission({
    folderName: "2026-09-28 Cut - a@b.co",
    files: [{ id: "1", safeName: "a.jpg", size: 4, blobPathname: "uploads/a", copiedBytes: 0 }],
    deps,
  });
  assert.equal(result.status, "failed");
  assert.equal(deleted.length, 0);
});

test("a byte budget stops mid-file without emailing or deleting", async () => {
  const { deps, deleted } = memoryDeps({ budgetBytes: MOVE_CHUNK_BYTES });
  const result = await moveSubmission({
    folderName: "2026-09-28 Cut - a@b.co",
    files: [
      {
        id: "1",
        safeName: "big.bin",
        size: MOVE_CHUNK_BYTES * 3,
        blobPathname: "uploads/big",
        copiedBytes: 0,
      },
    ],
    deps,
  });
  assert.equal(result.status, "partial");
  if (result.status !== "partial") return;
  assert.equal(result.copied[0]?.copiedBytes, MOVE_CHUNK_BYTES);
  assert.equal(deleted.length, 0);
  assert.equal(notificationFor(result, { receivedNotifiedAt: null, failureNotifiedAt: null }), "none");
});

test("Billy's notice is one email and includes the folder", () => {
  const received = filesReceivedMessage({
    label: "Headshots",
    email: "guest@example.com",
    fileCount: 2,
    totalBytes: 1536,
    nasPath: "/share/upload/2026-09-28 Headshots - guest@example.com",
  });
  assert.equal(received.to, DEFAULT_BOOKING_NOTIFY_EMAIL);
  assert.equal(received.subject, "Files received");
  assert.match(received.text, /Headshots/);
  assert.match(received.text, /guest@example.com/);
  assert.match(received.text, /Files: 2/);
  assert.match(received.text, /\/share\/upload\/2026-09-28 Headshots - guest@example.com/);
  assert.equal(formatBytes(1536), "1.5 KB");
  const failed = moveFailedMessage({
    label: "Headshots",
    email: "guest@example.com",
    fileCount: 2,
    totalBytes: 1536,
    nasPath: "",
    reason: "No folder named upload on the NAS share.",
  });
  assert.equal(failed.to, DEFAULT_BOOKING_NOTIFY_EMAIL);
  assert.equal(failed.subject, "Upload move failed");
  assert.match(failed.text, /No folder named upload/);
  assert.match(failed.text, /cloud storage/);
});
