"use client";

import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  downloadOriginalFile,
  downloadZipFromPost,
  type DownloadFile,
} from "@/components/download-controls";
import { shootPrimaryButtonClass, shootSecondaryButtonClass } from "@/components/shoot-buttons";
import { formatZipStatus, type ZipJobProgress } from "@/lib/download-all";
import {
  selectionCountLabel,
  selectionDownloadKind,
  toggleSelectedId,
} from "@/lib/shoot-selection";
import { cn } from "@/lib/utils";

export type ShootSelectionItem = DownloadFile & { id: string };

type ShootSelectionApi = {
  selecting: boolean;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  toggleSelecting: () => void;
};

const ShootSelectionContext = createContext<ShootSelectionApi | null>(null);

export function useShootSelection() {
  return useContext(ShootSelectionContext);
}

export function SelectionMark({
  selected,
  className,
}: {
  selected: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border",
        selected ? "border-white bg-white text-black" : "border-white bg-black/55 text-transparent",
        className,
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

export function ShootSelection({
  items,
  zipUrl,
  folderName,
  children,
}: {
  items: ShootSelectionItem[];
  zipUrl?: string;
  folderName: string;
  children: React.ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<"preparing" | "downloading" | "idle">("idle");
  const [status, setStatus] = useState("");

  const toggle = useCallback((id: string) => {
    setSelected((current) => toggleSelectedId(current, id));
  }, []);

  const toggleSelecting = useCallback(() => {
    setSelecting((on) => !on);
    setSelected(new Set());
    setStatus("");
  }, []);

  const api = useMemo<ShootSelectionApi>(
    () => ({ selecting, selected, toggle, toggleSelecting }),
    [selecting, selected, toggle, toggleSelecting],
  );

  const count = items.reduce((total, item) => total + (selected.has(item.id) ? 1 : 0), 0);

  async function downloadSelected() {
    const picked = items.filter((item) => selected.has(item.id));
    const kind = selectionDownloadKind(picked.length);
    if (kind === "none" || pending) return;
    if (kind === "file") {
      downloadOriginalFile(picked[0]);
      return;
    }
    if (!zipUrl) {
      setStatus("Download failed. Try again, or Download a single file.");
      return;
    }
    setPending(true);
    setPhase("preparing");
    setStatus("");
    try {
      await downloadZipFromPost(
        zipUrl,
        folderName,
        picked.map((item) => item.id),
        (progress: ZipJobProgress) => {
          setPhase(progress.state === "preparing" ? "preparing" : "downloading");
          setStatus(formatZipStatus(progress));
        },
      );
    } catch {
      setStatus("Download failed. Try again, or Download a single file.");
    } finally {
      setPending(false);
      setPhase("idle");
    }
  }

  return (
    <ShootSelectionContext.Provider value={api}>
      {children}
      {selecting ? (
        <>
          <div className="h-28" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <div className="mx-auto flex w-full max-w-[430px] flex-col gap-2 px-6 md:max-w-3xl md:flex-row md:items-center md:px-8 lg:max-w-[1120px] lg:px-10 xl:max-w-[1440px] xl:px-12 2xl:max-w-[1680px]">
              <p className="text-sm md:min-w-0 md:flex-1" aria-live="polite">
                {selectionCountLabel(count)}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(items.map((item) => item.id)))}
                  className={shootSecondaryButtonClass}
                >
                  Select all
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className={shootSecondaryButtonClass}>
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => void downloadSelected()}
                  disabled={count === 0 || pending}
                  className={shootPrimaryButtonClass}
                >
                  {phase === "preparing" ? "Preparing…" : phase === "downloading" ? "Downloading…" : "Download"}
                </button>
              </div>
              {status ? <p className="text-xs text-[#8e8e93] md:shrink-0">{status}</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </ShootSelectionContext.Provider>
  );
}
