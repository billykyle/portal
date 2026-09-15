"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
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
    <search className="mb-4">
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
    <li className="border-b border-white/10">
      <Link href={shoot.href} className="flex items-center gap-3 py-4">
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
  return (
    <li className="border-b border-white/10 py-4">
      <Link href={shoot.href} className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px]">{shoot.dateLabel}</p>
          <p className="text-sm text-[#8e8e93]">{shoot.address}</p>
          <p className="mt-1 text-xs text-[#8e8e93]">
            {shoot.fileCount} file{shoot.fileCount === 1 ? "" : "s"}
            {shoot.hasDropbox ? " · Dropbox backup" : ""}
            {shoot.deliveredLabel
              ? ` · Delivered ${shoot.deliveredLabel}`
              : " · Not delivered"}
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
    </li>
  );
}

export function ShootList(props: LibraryProps | AdminProps) {
  const [query, setQuery] = useState("");
  const matches = filterShoots(props.shoots, query);

  if (props.shoots.length === 0) {
    return <p className="text-sm text-[#8e8e93]">{props.emptyLabel}</p>;
  }

  return (
    <div>
      <ShootSearchField value={query} onChange={setQuery} />
      {matches.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No shoots match.</p>
      ) : props.variant === "admin" ? (
        <ul>
          {matches.map((shoot) => (
            <AdminRow key={shoot.id} shoot={shoot} />
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col">
          {matches.map((shoot) => (
            <LibraryRow key={shoot.id} shoot={shoot} />
          ))}
        </ul>
      )}
    </div>
  );
}
