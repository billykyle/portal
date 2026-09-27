"use client";

import { requestShootSection } from "@/components/deliverable-section";

export function ShootSectionNav({
  items,
}: {
  items: { id: string; label: string; count: number }[];
}) {
  if (items.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Media on this shoot">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="text-white underline-offset-2 hover:underline"
          onClick={() => requestShootSection(item.id)}
        >
          {item.label} ({item.count})
        </a>
      ))}
    </nav>
  );
}
