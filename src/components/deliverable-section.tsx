"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { sectionLabelTextClass } from "@/components/phone-shell";
import { SectionLayoutProvider } from "@/components/section-layout";
import {
  SHOOT_LAYOUT_COOKIE,
  parseListShootSections,
  serializeListShootSections,
  shootLayoutCookie,
  type SectionLayout,
} from "@/lib/shoot-layout";
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
function LayoutToggle({
  value,
  onChange,
}: {
  value: SectionLayout;
  onChange: (next: SectionLayout) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-full bg-[#1c1c1e] p-0.5" role="group" aria-label="Layout">
      {(
        [
          ["grid", "Grid"],
          ["list", "List"],
        ] as const
      ).map(([option, label]) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-8 rounded-full px-2.5 text-xs",
              selected ? "bg-white text-black" : "text-[#8e8e93]",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function DeliverableSection({
  id,
  label,
  detail,
  defaultOpen,
  layout = "grid",
  children,
}: {
  id: string;
  label: string;
  /** Extra header text. Only Raw video uses this. */
  detail?: string;
  defaultOpen: boolean;
  /** Grid unless this browser saved list for this section type. */
  layout?: SectionLayout;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [seenDefault, setSeenDefault] = useState(defaultOpen);
  const [mode, setMode] = useState<SectionLayout>(layout);
  const [seenLayout, setSeenLayout] = useState(layout);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  if (defaultOpen !== seenDefault) {
    setSeenDefault(defaultOpen);
    if (defaultOpen) setOpen(true);
  }
  if (layout !== seenLayout) {
    setSeenLayout(layout);
    setMode(layout);
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

  const rememberLayout = useCallback(
    (next: SectionLayout) => {
      const ids = new Set(parseListShootSections(readCookie(document.cookie, SHOOT_LAYOUT_COOKIE)));
      if (next === "list") ids.add(id);
      else ids.delete(id);
      document.cookie = shootLayoutCookie(
        serializeListShootSections(ids),
        window.location.protocol === "https:",
      );
      setMode(next);
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
    <section id={id} className="flex flex-col gap-2" data-layout={mode}>
      <h2 id={headingId} className="flex min-h-11 items-center gap-2 font-normal">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center py-1 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => remember(!open)}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className={sectionLabelTextClass}>{label}</span>
            {detail ? <span className="text-sm tabular-nums text-[#c7c7cc]">{detail}</span> : null}
          </span>
        </button>
        <LayoutToggle value={mode} onChange={rememberLayout} />
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? `Hide ${label}` : `Show ${label}`}
          onClick={() => remember(!open)}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 text-[#8e8e93] transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        </button>
      </h2>
      <SectionLayoutProvider value={mode}>
        {open ? (
          <div id={panelId} role="region" aria-labelledby={headingId}>
            {children}
          </div>
        ) : null}
      </SectionLayoutProvider>
    </section>
  );
}
