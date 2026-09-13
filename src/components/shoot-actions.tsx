"use client";

import { useState } from "react";
import { saveOne, saveToFolder, type DownloadFile } from "@/components/download-controls";
import { publicShootPath } from "@/lib/public-link";

const chip =
  "inline-flex h-9 shrink-0 appearance-none items-center justify-center rounded-lg px-2.5 text-sm";

export function ShootActions({
  files,
  folderName,
  shareToken,
  dropboxUrl,
  showBackup = false,
}: {
  files: DownloadFile[];
  folderName: string;
  shareToken?: string;
  dropboxUrl?: string | null;
  showBackup?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  function publicHref() {
    return `${window.location.origin}${publicShootPath(shareToken ?? "")}`;
  }

  async function downloadAll() {
    setPending(true);
    setStatus("");
    try {
      try {
        const usedFolder = await saveToFolder(files, folderName);
        if (usedFolder) {
          setStatus(`Saved ${files.length} files into ${folderName}.`);
          return;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
      for (const file of files) {
        await saveOne(file);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      setStatus(`Started ${files.length} downloads.`);
    } catch {
      setStatus("Could not download every file. Try a single file instead.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicHref());
    setStatus("Link copied.");
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={downloadAll}
          disabled={pending || files.length === 0}
          className={`${chip} bg-white font-medium text-black disabled:bg-[#c7c7cc] disabled:text-black/45`}
        >
          {pending ? "Saving…" : "Download"}
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
            Backup
          </button>
        ) : null}
      </div>
      {backupOpen ? (
        <p className="text-xs text-[#8e8e93]">
          {dropboxUrl ? (
            <a href={dropboxUrl} target="_blank" rel="noreferrer" className="break-all underline">
              Open Dropbox backup
            </a>
          ) : (
            "No backup link for this shoot."
          )}
        </p>
      ) : null}
      {status ? <p className="text-xs text-[#8e8e93]">{status}</p> : null}
    </div>
  );
}
