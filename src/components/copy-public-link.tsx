"use client";

import { useState } from "react";
import { publicShootPath } from "@/lib/public-link";

export function CopyPublicLink({
  token,
  compact = false,
}: {
  token: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState("");

  function href() {
    return `${window.location.origin}${publicShootPath(token)}`;
  }

  async function copy() {
    await navigator.clipboard.writeText(href());
    setStatus("Link copied.");
    window.setTimeout(() => setStatus(""), 2000);
  }

  async function share() {
    const url = href();
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
    await copy();
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" onClick={copy} className="text-sm text-white">
          {status ? "Copied" : "Copy link"}
        </button>
        <button type="button" onClick={share} className="text-sm text-[#8e8e93]">
          Share
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex h-12 flex-1 appearance-none items-center justify-center rounded-xl border-0 bg-white text-base font-medium text-black"
        >
          Copy public link
        </button>
        <button
          type="button"
          onClick={share}
          className="flex h-12 appearance-none items-center justify-center rounded-xl border border-white/20 px-5 text-base text-white"
        >
          Share
        </button>
      </div>
      {status ? <p className="text-xs text-[#8e8e93]">{status}</p> : null}
    </div>
  );
}
