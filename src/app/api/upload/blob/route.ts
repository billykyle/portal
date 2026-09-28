import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { getUploadSubmission } from "@/lib/upload/store";
import { authorizeBlobUpload } from "@/lib/upload/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Upload is unavailable." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await ensureDb();
        let submissionId = "";
        try {
          const payload = JSON.parse(clientPayload ?? "") as { submissionId?: unknown };
          submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "";
        } catch {
          throw new Error("Upload is unavailable.");
        }
        const loaded = await getUploadSubmission(submissionId);
        if (!loaded) throw new Error("Upload is unavailable.");
        const allowed = authorizeBlobUpload({
          pathname,
          clientPayload,
          submissionStatus: loaded.submission.status,
          files: loaded.files,
        });
        if (!allowed.ok) throw new Error(allowed.error);
        return {
          addRandomSuffix: false,
          allowOverwrite: false,
          maximumSizeInBytes: allowed.sizeBytes,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async () => {
        // The browser confirms the finished blobs via /api/upload/complete.
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload is unavailable.";
    const safe = message.startsWith("Upload") || message.startsWith("This upload") ? message : "Upload is unavailable.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
