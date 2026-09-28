export function authorizeBlobUpload(input: {
  pathname: string;
  clientPayload: string | null;
  submissionStatus: string;
  files: Array<{ id: string; blobPathname: string; sizeBytes: number; status: string }>;
}):
  | { ok: true; sizeBytes: number }
  | { ok: false; error: string } {
  if (input.submissionStatus !== "open") return { ok: false, error: "This upload is closed." };
  let fileId = "";
  try {
    const payload = JSON.parse(input.clientPayload ?? "") as { fileId?: unknown };
    fileId = typeof payload.fileId === "string" ? payload.fileId : "";
  } catch {
    return { ok: false, error: "Upload is unavailable." };
  }
  const file = input.files.find((item) => item.id === fileId);
  if (!file || file.blobPathname !== input.pathname || file.status === "stored") {
    return { ok: false, error: "Upload is unavailable." };
  }
  return { ok: true, sizeBytes: file.sizeBytes };
}
