"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { activeNavId, navItemsFor, type AppNavSide } from "@/lib/app-nav";
import { cn } from "@/lib/utils";

/**
 * Top-left page switcher: three dots stacked like a burger / kebab.
 * Same control on client and admin. Auth and public share pages do not mount it.
 */
export function NavMenu({ side }: { side: AppNavSide }) {
  const pathname = usePathname() ?? "";
  const items = navItemsFor(side);
  const activeId = activeNavId(side, pathname);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(288, window.innerWidth - 32);
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
      setAnchor({ top: rect.bottom + 8, left });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="-ml-2 flex size-11 shrink-0 flex-col items-center justify-center gap-[5px] rounded-full text-white hover:bg-white/10"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <span className="size-[5px] rounded-full bg-current" />
        <span className="size-[5px] rounded-full bg-current" />
        <span className="size-[5px] rounded-full bg-current" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[70] cursor-default bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Pages"
            className="fixed z-[80] w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#1c1c1e] p-2 shadow-2xl"
            style={anchor ? { top: anchor.top, left: anchor.left } : { top: "4.5rem", left: "1.5rem" }}
          >
            <nav className="flex flex-col gap-1" aria-label="Pages">
              {items.map((item) => {
                const active = item.id === activeId;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-xl px-4 py-3 text-[17px] leading-snug",
                      active ? "bg-white font-medium text-black" : "text-white hover:bg-white/10",
                    )}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      ) : null}
    </>
  );
}
