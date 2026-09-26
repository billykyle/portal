"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CLIENT_SORT_LABELS,
  CLIENT_SORTS,
  type ClientSort,
  clientSortCookie,
  isClientSort,
} from "@/lib/admin/client-sort";

export function ClientSortSelect({ value }: { value: ClientSort }) {
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setSelected(value);
  }

  return (
    <div className="relative w-52 max-w-full shrink-0">
      <label htmlFor="client-sort" className="sr-only">
        Sort clients
      </label>
      <select
        id="client-sort"
        value={selected}
        onChange={(event) => {
          const next = event.target.value;
          if (!isClientSort(next)) return;
          setSelected(next);
          document.cookie = clientSortCookie(next, window.location.protocol === "https:");
          router.refresh();
        }}
        className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] pl-4 pr-10 text-sm text-white outline-none"
      >
        {CLIENT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {CLIENT_SORT_LABELS[sort]}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#8e8e93]"
      />
    </div>
  );
}
