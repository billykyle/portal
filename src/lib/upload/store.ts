import { randomUUID } from "crypto";
import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadFiles, uploadSubmissions } from "@/lib/db/schema";
import { submissionFolderBase, uniqueFolderName, uploadBlobPath } from "@/lib/upload/names";
import { MOVE_LOCK_MS } from "@/lib/upload/move";
import type { UploadRequestFile } from "@/lib/upload/policy";

export async function reserveUploadSubmission(input: {
  name: string;
  label: string;
  email: string;
  files: UploadRequestFile[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const base = submissionFolderBase({ label: input.label, name: input.name });
  const takenRows = await db.select({ folderName: uploadSubmissions.folderName }).from(uploadSubmissions);
  const folderName = uniqueFolderName(
    base,
    takenRows.map((row) => row.folderName),
  );
  const submissionId = randomUUID();
  const files = input.files.map((file) => {
    const id = randomUUID();
    return {
      id,
      submissionId,
      originalName: file.name,
      safeName: file.safeName,
      sizeBytes: file.size,
      blobPathname: uploadBlobPath(submissionId, id, file.safeName),
      status: "pending",
    };
  });
  await db.insert(uploadSubmissions).values({
    id: submissionId,
    name: input.name,
    label: input.label,
    email: input.email,
    folderName,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  if (files.length > 0) await db.insert(uploadFiles).values(files);
  return { submissionId, folderName, files };
}

export async function getUploadSubmission(id: string) {
  const [submission] = await db.select().from(uploadSubmissions).where(eq(uploadSubmissions.id, id)).limit(1);
  if (!submission) return null;
  const files = await db.select().from(uploadFiles).where(eq(uploadFiles.submissionId, id));
  return { submission, files };
}

export async function markUploadStaged(
  id: string,
  files: Array<{ id: string; blobUrl: string }>,
) {
  const now = new Date();
  for (const file of files) {
    await db
      .update(uploadFiles)
      .set({ status: "staged", blobUrl: file.blobUrl })
      .where(and(eq(uploadFiles.id, file.id), eq(uploadFiles.submissionId, id)));
  }
  await db
    .update(uploadSubmissions)
    .set({ status: "staged", updatedAt: now, error: null })
    .where(eq(uploadSubmissions.id, id));
}

export async function claimUploadMove(id: string, now = new Date()) {
  const stale = new Date(now.getTime() - MOVE_LOCK_MS);
  const claimed = await db
    .update(uploadSubmissions)
    .set({ status: "moving", updatedAt: now })
    .where(
      and(
        eq(uploadSubmissions.id, id),
        or(
          eq(uploadSubmissions.status, "staged"),
          and(eq(uploadSubmissions.status, "moving"), lt(uploadSubmissions.updatedAt, stale)),
        ),
      ),
    )
    .returning({ id: uploadSubmissions.id });
  return claimed.length > 0;
}

export async function listUploadMoveIds(now = new Date()) {
  const stale = new Date(now.getTime() - MOVE_LOCK_MS);
  const rows = await db
    .select({ id: uploadSubmissions.id })
    .from(uploadSubmissions)
    .where(
      or(
        eq(uploadSubmissions.status, "staged"),
        and(eq(uploadSubmissions.status, "moving"), lt(uploadSubmissions.updatedAt, stale)),
      ),
    );
  return rows.map((row) => row.id);
}

export async function saveUploadProgress(input: {
  id: string;
  status: "staged" | "stored";
  folderName: string;
  nasPath: string;
  error: string | null;
  receivedNotifiedAt?: Date | null;
  failureNotifiedAt?: Date | null;
  files: Array<{ id: string; copiedBytes: number; status: string }>;
}) {
  const now = new Date();
  await db
    .update(uploadSubmissions)
    .set({
      status: input.status,
      folderName: input.folderName,
      nasPath: input.nasPath || null,
      error: input.error,
      updatedAt: now,
      ...(input.receivedNotifiedAt ? { receivedNotifiedAt: input.receivedNotifiedAt } : {}),
      ...(input.failureNotifiedAt ? { failureNotifiedAt: input.failureNotifiedAt } : {}),
    })
    .where(eq(uploadSubmissions.id, input.id));
  for (const file of input.files) {
    await db
      .update(uploadFiles)
      .set({ copiedBytes: file.copiedBytes, status: file.status })
      .where(and(eq(uploadFiles.id, file.id), eq(uploadFiles.submissionId, input.id)));
  }
}
