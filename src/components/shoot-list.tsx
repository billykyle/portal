"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { CopyPublicLink } from "@/components/copy-public-link";
import { listSearchClass, shootCardGridClass } from "@/components/phone-shell";
import { filterShoots } from "@/lib/shoot-search";

export type ShootListItem = {
  id: string;
  href: string;
  address: string;
  shotDate: string;
  dateLabel: string;
};

export type AdminShootListItem = ShootListItem & {
  fileCount: number;
  publicToken: string;
};

type LibraryProps = {
  variant?: "library";
  shoots: ShootListItem[];
  emptyLabel: string;
};

type AdminProps = {
  variant: "admin";
  shoots: AdminShootListItem[];
  emptyLabel: string;
};

function filesLabel(count: number) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

function ShootSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const searchId = useId();
  return (
    <search className={listSearchClass}>
      <label htmlFor={searchId} className="sr-only">
        Search shoots
      </label>
      <input
        id={searchId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search shoots"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
      />
    </search>
  );
}

function LibraryRow({ shoot }: { shoot: ShootListItem }) {
  return (
    <li className="border-b border-white/10 lg:border-0">
      <Link
        href={shoot.href}
        className="flex items-center gap-3 py-4 lg:h-full lg:rounded-xl lg:border lg:border-white/10 lg:p-5 lg:hover:bg-white/5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{shoot.address}</p>
          <p className="text-sm text-[#8e8e93]">{shoot.dateLabel}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-[#8e8e93]" />
      </Link>
    </li>
  );
}

function AdminRow({ shoot }: { shoot: AdminShootListItem }) {
  return (
    <li className="border-b border-white/10 lg:border-0">
      <div className="py-4 lg:flex lg:h-full lg:flex-col lg:rounded-xl lg:border lg:border-white/10 lg:p-5">
        <Link href={shoot.href} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px]">{shoot.address}</p>
            <p className="text-sm text-[#8e8e93]">
              {shoot.dateLabel} · {filesLabel(shoot.fileCount)}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-[#8e8e93]" />
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CopyPublicLink token={shoot.publicToken} compact />
        </div>
      </div>
    </li>
  );
}

function FilteredShoots({
  query,
  onQueryChange,
  matchCount,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  children: ReactNode;
}) {
  return (
    <div>
      <ShootSearchField value={query} onChange={onQueryChange} />
      {matchCount === 0 ? <p className="text-sm text-[#8e8e93]">No shoots match.</p> : children}
    </div>
  );
}

export function ShootList(props: LibraryProps | AdminProps) {
  const [query, setQuery] = useState("");

  if (props.shoots.length === 0) {
    return <p className="text-sm text-[#8e8e93]">{props.emptyLabel}</p>;
  }

  if (props.variant === "admin") {
    const matches = filterShoots(props.shoots, query);
    return (
      <FilteredShoots query={query} onQueryChange={setQuery} matchCount={matches.length}>
        <ul className={shootCardGridClass}>
          {matches.map((shoot) => (
            <AdminRow key={shoot.id} shoot={shoot} />
          ))}
        </ul>
      </FilteredShoots>
    );
  }

  const matches = filterShoots(props.shoots, query);
  return (
    <FilteredShoots query={query} onQueryChange={setQuery} matchCount={matches.length}>
      <ul className={shootCardGridClass}>
        {matches.map((shoot) => (
          <LibraryRow key={shoot.id} shoot={shoot} />
        ))}
      </ul>
    </FilteredShoots>
  );
}
