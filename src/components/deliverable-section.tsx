"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { sectionLabelTextClass } from "@/components/phone-shell";
import {
  SHOOT_SECTIONS_COOKIE,
  parseClosedShootSections,
  readCookie,
  serializeClosedShootSections,
  shootSectionsCookie,
} from "@/lib/shoot-sections";
import { cn } from "@/lib/utils";

export const SHOOT_SECTION_EVENT = "bk-shoot-section";

/** Ask a deliverable section to open. Jump links use this when the hash is already set. */
export function requestShootSection(id: string) {
  window.dispatchEvent(new CustomEvent(SHOOT_SECTION_EVENT, { detail: id }));
}

/**
 * One deliverable group (Photos, Floor plans, Video).
 * Open unless this browser closed that type. The grid mounts only while open,
 * so a closed section does not request thumbnails.
 */
export function DeliverableSection({
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
  const openRef = useRef(open);
  openRef.current = open;
  if (defaultOpen !== seenDefault) {
    setSeenDefault(defaultOpen);
    if (defaultOpen) setOpen(true);
  }

  const remember = useCallback(
    (next: boolean) => {
      const ids = new Set(parseClosedShootSections(readCookie(document.cookie, SHOOT_SECTIONS_COOKIE)));
      if (next) ids.delete(id);
      else ids.add(id);
      document.cookie = shootSectionsCookie(
        serializeClosedShootSections(ids),
        window.location.protocol === "https:",
      );
      setOpen(next);
    },
    [id],
  );

  useEffect(() => {
    function openFor(sectionId: string, scroll: boolean) {
      if (sectionId !== id) return;
      const wasOpen = openRef.current;
      remember(true);
      if (scroll || !wasOpen) {
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
      }
    }
    function onHash() {
      if (window.location.hash === `#${id}`) openFor(id, true);
    }
    function onRequest(event: Event) {
      const sectionId = (event as CustomEvent<string>).detail;
      if (typeof sectionId === "string") openFor(sectionId, true);
    }
    if (window.location.hash === `#${id}`) openFor(id, false);
    window.addEventListener("hashchange", onHash);
    window.addEventListener(SHOOT_SECTION_EVENT, onRequest);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(SHOOT_SECTION_EVENT, onRequest);
    };
  }, [id, remember]);

  return (
    <section id={id} className="flex flex-col gap-2">
      <h2 id={headingId} className="font-normal">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => remember(!open)}
        >
          <span className={sectionLabelTextClass}>{label}</span>
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-[#8e8e93] transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        </button>
      </h2>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={headingId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
