"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  downloadZipFromUrl,
  zipAndDownloadFiles,
  type DownloadFile,
} from "@/components/download-controls";
import { emptyZipProgress, formatZipStatus, zipDownloadName, type ZipJobProgress } from "@/lib/download-all";
import {
  filterFilesByZipTypes,
  presentMediaTypes,
  typesFromScope,
  withZipTypes,
  zipDownloadOptions,
  zipScopeFolderName,
  type ZipMediaType,
} from "@/lib/download-scope";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const present = presentMediaTypes(files);
  const needsPicker = present.length > 1;
  const options = zipDownloadOptions(present);

  function publicHref() {
    return `${window.location.origin}${publicShootPath(shareToken ?? "")}`;
  }

  function report(next: ZipJobProgress) {
    setProgress(next);
    setStatus(formatZipStatus(next));
  }

  async function startDownload(scope: "all" | ZipMediaType) {
    const types = typesFromScope(scope);
    const scopedFiles = filterFilesByZipTypes(files, types);
    const scopedFolder = zipScopeFolderName(folderName, types, present);
    const zipName = zipDownloadName(scopedFolder);
    setMenuOpen(false);
    setPending(true);
    setStatus("");
    setProgress(emptyZipProgress("preparing", scopedFiles.length, zipName));
    try {
      const scopedZipUrl = zipUrl ? withZipTypes(zipUrl, types) : undefined;
      if (scopedZipUrl) {
        await downloadZipFromUrl(scopedZipUrl, scopedFolder, report);
      } else {
        await zipAndDownloadFiles(scopedFiles, scopedFolder, report);
      }
    } catch {
      setProgress((current) =>
        current
          ? { ...current, state: "failed", percent: 0 }
          : emptyZipProgress("failed", scopedFiles.length, zipName),
      );
      setStatus("Download failed. Try again, or Download a single file.");
    } finally {
      setPending(false);
    }
  }

  function onDownloadClick() {
    if (pending || files.length === 0) return;
    if (needsPicker) {
      setMenuOpen((open) => !open);
      return;
    }
    void startDownload("all");
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
  const activeZipName = progress?.filename || zipDownloadName(folderName);

  return (
    <div className="flex flex-col gap-2" ref={menuRef}>
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={onDownloadClick}
          disabled={pending || files.length === 0}
          aria-haspopup={needsPicker ? "menu" : undefined}
          aria-expanded={needsPicker ? menuOpen : undefined}
          aria-controls={needsPicker ? menuId : undefined}
          className={`${chip} gap-1 bg-white font-medium text-black disabled:bg-[#c7c7cc] disabled:text-black/45`}
        >
          {buttonLabel}
          {needsPicker && !pending ? (
            <span aria-hidden className="text-[10px] leading-none">
              ▾
            </span>
          ) : null}
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
      {needsPicker && menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className="overflow-hidden rounded-xl border border-white/15 bg-[#1c1c1e]"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => void startDownload(option.id)}
              className="flex h-11 w-full items-center px-3 text-left text-sm text-white hover:bg-white/10"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
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
        <p className="text-xs text-[#8e8e93]">Safari will ask once for {activeZipName}. Keep this page open.</p>
      ) : null}
    </div>
  );
}
