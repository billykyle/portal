"use client";

import { useState } from "react";

export function CopyPublicLink({
  url,
  compact = false,
}: {
  url: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState("");

  async function copy() {
    await navigator.clipboard.writeText(url);
    setStatus("Link copied.");
    window.setTimeout(() => setStatus(""), 2000);
  }

  if (compact) {
    return (
      <button type="button" onClick={copy} data-url={url} className="text-sm text-white">
        {status ? "Copied" : "Copy link"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={copy}
        data-url={url}
        className="flex h-12 w-full appearance-none items-center justify-center rounded-xl border-0 bg-white text-base font-medium text-black"
      >
        Copy public link
      </button>
      {status ? <p className="text-xs text-[#8e8e93]">{status}</p> : null}
    </div>
  );
}
