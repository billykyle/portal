"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import {
  ADMIN_SECTIONS_COOKIE,
  adminSectionsCookie,
  parseOpenSections,
  readCookie,
  serializeOpenSections,
} from "@/lib/admin/sections";
import { cn } from "@/lib/utils";

/**
 * One admin module. The header is the only always-visible row.
 * Open/closed is remembered in a cookie; the address bar is not involved.
 */
export function AdminSection({
  id,
  label,
  defaultOpen,
  children,
}: {
  id: string;
  label: string;
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
    const ids = new Set(parseOpenSections(readCookie(document.cookie, ADMIN_SECTIONS_COOKIE)));
    if (next) ids.add(id);
    else ids.delete(id);
    document.cookie = adminSectionsCookie(
      serializeOpenSections(ids),
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
          <span className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{label}</span>
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-[#8e8e93] transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        aria-hidden={open ? undefined : true}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className={open ? "overflow-visible" : "overflow-hidden"} inert={open ? undefined : true}>
          <div className="pt-1 pb-8">{children}</div>
        </div>
      </div>
    </section>
  );
}
