"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { CopyPublicLink } from "@/components/copy-public-link";
import { DeleteShootForm } from "@/components/forms/delete-shoot-form";
import { MarkDeliveredForm } from "@/components/forms/mark-delivered-form";
import { filterShoots } from "@/lib/shoot-search";

export type ShootListItem = {
  id: string;
  href: string;
  address: string;
  shotDate: string;
  dateLabel: string;
};

export type AdminShootListItem = ShootListItem & {
  clientId: string;
  fileCount: number;
  publicUrl: string;
  publicToken: string;
  hasDropbox: boolean;
  deliveredLabel: string | null;
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

function ShootSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const searchId = useId();
  return (
    <search className="mb-4 lg:mb-6 lg:max-w-md">
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
        className="flex items-center gap-3 py-4 lg:h-full lg:rounded-xl lg:border lg:border-white/10 lg:px-4 lg:py-5 lg:hover:bg-white/5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px]">{shoot.dateLabel}</p>
          <p className="truncate text-sm text-[#8e8e93]">{shoot.address}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-[#8e8e93]" />
      </Link>
    </li>
  );
}

function AdminRow({ shoot }: { shoot: AdminShootListItem }) {
  const filesLabel = `${shoot.fileCount} file${shoot.fileCount === 1 ? "" : "s"}`;
  const extras = [
    shoot.hasDropbox ? "Dropbox backup" : null,
    shoot.deliveredLabel ? `Delivered ${shoot.deliveredLabel}` : "Not delivered",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="border-b border-white/10 py-4 xl:grid xl:grid-cols-[7.5rem_minmax(0,1.5fr)_4.5rem_9rem_minmax(0,1fr)_auto] xl:items-center xl:gap-4 xl:py-3">
      <div className="xl:hidden">
        <Link href={shoot.href} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px]">{shoot.dateLabel}</p>
            <p className="text-sm text-[#8e8e93]">{shoot.address}</p>
            <p className="mt-1 text-xs text-[#8e8e93]">
              {filesLabel}
              {extras ? ` · ${extras}` : ""}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-[#8e8e93]" />
        </Link>
        <p className="mt-1 break-all text-xs text-[#8e8e93]">{shoot.publicUrl}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CopyPublicLink token={shoot.publicToken} compact />
          {shoot.deliveredLabel ? null : (
            <MarkDeliveredForm clientId={shoot.clientId} shootId={shoot.id} />
          )}
          <DeleteShootForm
            clientId={shoot.clientId}
            shootId={shoot.id}
            address={shoot.address}
          />
        </div>
      </div>

      <Link href={shoot.href} className="hidden text-[15px] text-white hover:underline xl:block">
        {shoot.dateLabel}
      </Link>
      <Link href={shoot.href} className="hidden truncate text-sm text-white hover:underline xl:block">
        {shoot.address}
      </Link>
      <p className="hidden text-sm text-[#8e8e93] xl:block">{filesLabel}</p>
      <p className="hidden text-sm text-[#8e8e93] xl:block">
        {shoot.deliveredLabel ? `Delivered ${shoot.deliveredLabel}` : "Not delivered"}
        {shoot.hasDropbox ? " · Dropbox" : ""}
      </p>
      <p className="hidden truncate text-xs text-[#8e8e93] xl:block">{shoot.publicUrl}</p>
      <div className="hidden flex-wrap items-center justify-end gap-3 xl:flex">
        <CopyPublicLink token={shoot.publicToken} compact />
        {shoot.deliveredLabel ? null : (
          <MarkDeliveredForm clientId={shoot.clientId} shootId={shoot.id} />
        )}
        <DeleteShootForm
          clientId={shoot.clientId}
          shootId={shoot.id}
          address={shoot.address}
        />
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
        <div className="hidden border-b border-white/10 pb-2 text-xs uppercase tracking-[0.14em] text-[#8e8e93] xl:grid xl:grid-cols-[7.5rem_minmax(0,1.5fr)_4.5rem_9rem_minmax(0,1fr)_auto] xl:gap-4">
          <span>Date</span>
          <span>Address</span>
          <span>Files</span>
          <span>Status</span>
          <span>Link</span>
          <span className="text-right">Actions</span>
        </div>
        <ul>
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
      <ul className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
        {matches.map((shoot) => (
          <LibraryRow key={shoot.id} shoot={shoot} />
        ))}
      </ul>
    </FilteredShoots>
  );
}
