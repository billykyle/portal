"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export type DownloadFile = {
  url: string;
  filename: string;
};

export async function saveOne(file: DownloadFile) {
  const response = await fetch(file.url);
  if (!response.ok) {
    throw new Error(`Could not download ${file.filename}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function saveToFolder(files: DownloadFile[], folderName: string) {
  const picker = (
    window as Window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) return false;
  const root = await picker();
  const folder = await root.getDirectoryHandle(folderName.replace(/[\\/]/g, "-"), {
    create: true,
  });
  for (const file of files) {
    const response = await fetch(file.url);
    const buffer = await response.arrayBuffer();
    const handle = await folder.getFileHandle(file.filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(buffer);
    await writable.close();
  }
  return true;
}

export function DownloadAllButton({
  files,
  folderName,
}: {
  files: DownloadFile[];
  folderName: string;
}) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function onClick() {
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

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || files.length === 0}
        className="flex h-12 w-full appearance-none items-center justify-center rounded-xl border-0 bg-white text-base font-medium text-black disabled:bg-[#c7c7cc] disabled:text-black/45"
      >
        {pending ? "Downloading…" : "Download all"}
      </button>
      {status ? <p className="text-xs text-[#8e8e93]">{status}</p> : null}
    </div>
  );
}

export function FileDownloadButton({ file }: { file: DownloadFile }) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Download ${file.filename}`}
      disabled={pending}
      onClick={async (event) => {
        event.stopPropagation();
        setPending(true);
        try {
          await saveOne(file);
        } finally {
          setPending(false);
        }
      }}
      className="rounded-full p-2 text-white/80 hover:text-white"
    >
      <Download className="size-4" />
    </button>
  );
}
