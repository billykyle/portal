"use client";

import { useState } from "react";
import {
  downloadZipFromUrl,
  zipAndDownloadFiles,
  type DownloadFile,
} from "@/components/download-controls";
import { emptyZipProgress, formatZipStatus, zipDownloadName, type ZipJobProgress } from "@/lib/download-all";
import { publicShootPath } from "@/lib/public-link";

const chip =
  "inline-flex h-9 shrink-0 appearance-none items-center justify-center rounded-lg px-2.5 text-sm";

export function ShootActions({
  files,
  folderName,
  zipUrl,
  shareToken,
  dropboxUrl,
  showBackup = false,
}: {
  files: DownloadFile[];
  folderName: string;
  zipUrl?: string;
  shareToken?: string;
  dropboxUrl?: string | null;
  showBackup?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<ZipJobProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const zipName = zipDownloadName(folderName);

  function publicHref() {
    return `${window.location.origin}${publicShootPath(shareToken ?? "")}`;
  }

  function report(next: ZipJobProgress) {
    setProgress(next);
    setStatus(formatZipStatus(next));
  }

  async function downloadAll() {
    setPending(true);
    setStatus("");
    setProgress(emptyZipProgress("preparing", files.length, zipName));
    try {
      if (zipUrl) {
        await downloadZipFromUrl(zipUrl, folderName, report);
      } else {
        await zipAndDownloadFiles(files, folderName, report);
      }
    } catch {
      setProgress((current) =>
        current
          ? { ...current, state: "failed", percent: 0 }
          : emptyZipProgress("failed", files.length, zipName),
      );
      setStatus("Download failed. Try again, or Save a single photo.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicHref());
    setStatus("Link copied.");
    setProgress(null);
    window.setTimeout(() => setStatus(""), 2000);
  }

  async function share() {
    const url = publicHref();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Shoot", url, text: "Open this shoot" });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    await copyLink();
  }

  const buttonLabel =
    pending && progress?.state === "preparing"
      ? "Preparing…"
      : pending
        ? "Downloading…"
        : "Download";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={downloadAll}
          disabled={pending || files.length === 0}
          className={`${chip} bg-white font-medium text-black disabled:bg-[#c7c7cc] disabled:text-black/45`}
        >
          {buttonLabel}
        </button>
        {shareToken ? (
          <>
            <button
              type="button"
              onClick={copyLink}
              className={`${chip} border border-white/20 text-white`}
            >
              Copy link
            </button>
            <button type="button" onClick={share} className={`${chip} border border-white/20 text-white`}>
              Share
            </button>
          </>
        ) : null}
        {showBackup ? (
          <button
            type="button"
            onClick={() => setBackupOpen((open) => !open)}
            aria-expanded={backupOpen}
            className={`${chip} border border-white/20 text-[#8e8e93]`}
          >
            Dropbox
          </button>
        ) : null}
      </div>
      {progress && progress.state !== "done" ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2c2c2e]">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-200"
              style={{ width: `${Math.max(progress.state === "failed" ? 0 : 2, progress.percent)}%` }}
            />
          </div>
        </div>
      ) : null}
      {backupOpen ? (
        <p className="text-xs text-[#8e8e93]">
          {dropboxUrl ? (
            <a href={dropboxUrl} target="_blank" rel="noreferrer" className="break-all underline">
              Open Dropbox
            </a>
          ) : (
            "No Dropbox link for this shoot."
          )}
        </p>
      ) : null}
      {status ? <p className="text-xs text-[#8e8e93]">{status}</p> : null}
      {pending && progress && (progress.state === "preparing" || progress.state === "downloading") ? (
        <p className="text-xs text-[#8e8e93]">Safari will ask once for {zipName}. Keep this page open.</p>
      ) : null}
    </div>
  );
}
