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

  if (compact) {
    return (
      <button type="button" onClick={copy} className="text-sm text-white">
        {status ? "Copied" : "Copy link"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={copy}
        className="flex h-12 w-full appearance-none items-center justify-center rounded-xl border-0 bg-white text-base font-medium text-black"
      >
        Copy public link
      </button>
      {status ? <p className="text-xs text-[#8e8e93]">{status}</p> : null}
    </div>
  );
}
