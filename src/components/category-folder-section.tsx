"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import {
  SHOOT_CATEGORY_FOLDERS_COOKIE,
  categoryFoldersCookie,
  parseClosedCategoryFolders,
  serializeClosedCategoryFolders,
} from "@/lib/shoot-categories";
import { readCookie } from "@/lib/shoot-sections";
import { cn } from "@/lib/utils";

/**
 * One NAS category on a client's shoot list.
 * Open unless this browser closed that folder name.
 */
export function CategoryFolderSection({
  name,
  defaultOpen,
  children,
}: {
  name: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [seenDefault, setSeenDefault] = useState(defaultOpen);
  if (defaultOpen !== seenDefault) {
    setSeenDefault(defaultOpen);
    if (defaultOpen) setOpen(true);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    const names = new Set(
      parseClosedCategoryFolders(readCookie(document.cookie, SHOOT_CATEGORY_FOLDERS_COOKIE)),
    );
    if (next) names.delete(name);
    else names.add(name);
    document.cookie = categoryFoldersCookie(
      serializeClosedCategoryFolders(names),
      window.location.protocol === "https:",
    );
  }

  return (
    <section className={cn("border-b border-white/10", open && "relative z-10")}>
      <h2 id={headingId} className="font-normal">
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between gap-4 py-3 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="text-sm text-[#c7c7cc]">{name}</span>
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-[#8e8e93] transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={headingId} hidden={open ? undefined : true}>
        {open ? <div className="pb-4">{children}</div> : null}
      </div>
    </section>
  );
}
