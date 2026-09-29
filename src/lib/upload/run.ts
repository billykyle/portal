import { sendEmail } from "@/lib/email";
import { filesReceivedMessage, moveFailedMessage } from "@/lib/upload/mail";
import { moveSubmission, notificationFor, type MoveResult } from "@/lib/upload/move";
import { liveMoveDeps } from "@/lib/upload/destination";
import {
  claimUploadMove,
  getUploadSubmission,
  listUploadMoveIds,
  saveUploadProgress,
} from "@/lib/upload/store";

export async function moveUploadSubmission(id: string) {
  const loaded = await getUploadSubmission(id);
  if (!loaded) return { id, status: "missing" as const };
  const { submission, files } = loaded;
  if (submission.status !== "staged" && submission.status !== "moving") {
    return { id, status: "skipped" as const };
  }
  const claimed = await claimUploadMove(id);
  if (!claimed) return { id, status: "busy" as const };

  const result = await moveSubmission({
    folderName: submission.folderName,
    files: files.map((file) => ({
      id: file.id,
      safeName: file.safeName,
      size: file.sizeBytes,
      blobPathname: file.blobPathname,
      copiedBytes: file.copiedBytes,
    })),
    deps: liveMoveDeps(),
  });

  const notice = notificationFor(result, {
    receivedNotifiedAt: submission.receivedNotifiedAt,
    failureNotifiedAt: submission.failureNotifiedAt,
  });
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const mailInput = {
    name: submission.name,
    label: submission.label,
    email: submission.email,
    fileCount: files.length,
    totalBytes,
    nasPath: result.nasPath,
    reason: result.status === "failed" ? result.reason : undefined,
  };

  let receivedNotifiedAt: Date | null = null;
  let failureNotifiedAt: Date | null = null;
  if (notice === "received") {
    const sent = await sendEmail(filesReceivedMessage(mailInput));
    if (sent.sent) receivedNotifiedAt = new Date();
  } else if (notice === "failed") {
    const sent = await sendEmail(moveFailedMessage(mailInput));
    if (sent.sent) failureNotifiedAt = new Date();
  }

  await persistMove(id, result, { receivedNotifiedAt, failureNotifiedAt });
  return { id, status: result.status };
}

async function persistMove(
  id: string,
  result: MoveResult,
  notices: { receivedNotifiedAt: Date | null; failureNotifiedAt: Date | null },
) {
  if (result.status === "stored") {
    const loaded = await getUploadSubmission(id);
    await saveUploadProgress({
      id,
      status: "stored",
      folderName: result.folderName,
      nasPath: result.nasPath,
      error: null,
      receivedNotifiedAt: notices.receivedNotifiedAt,
      files: (loaded?.files ?? []).map((file) => ({
        id: file.id,
        copiedBytes: file.sizeBytes,
        status: "stored",
      })),
    });
    return;
  }

  const status = "staged" as const;
  await saveUploadProgress({
    id,
    status,
    folderName: result.folderName,
    nasPath: result.nasPath,
    error: result.status === "failed" ? result.reason : null,
    failureNotifiedAt: notices.failureNotifiedAt,
    files: result.copied.map((file) => ({
      id: file.id,
      copiedBytes: file.copiedBytes,
      status: "staged",
    })),
  });
}

export async function moveDueUploads() {
  const ids = await listUploadMoveIds();
  const results = [];
  for (const id of ids) {
    results.push(await moveUploadSubmission(id));
  }
  return { count: results.length, results };
}
