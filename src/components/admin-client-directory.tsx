import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ClientSortSelect } from "@/components/client-sort-select";
import type { ClientSort } from "@/lib/admin/client-sort";

export function AdminClientDirectory({
  rowsEmpty,
  visible,
  query,
  sort,
  searchAction,
}: {
  rowsEmpty: boolean;
  visible: { id: string; inviteCode: string; displayName: string; company: string | null; primaryEmail: string }[];
  query: string;
  sort: ClientSort;
  searchAction: string;
}) {
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:gap-4">
        <form action={searchAction} method="get" className="min-w-0 w-full lg:flex-1">
          <label htmlFor="client-search" className="sr-only">
            Find a client or login
          </label>
          <input
            id="client-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Find a client or login"
            autoComplete="off"
            className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
          />
        </form>
        <ClientSortSelect value={sort} />
      </div>
      {rowsEmpty ? (
        <p className="text-sm text-[#8e8e93]">No clients yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No clients match.</p>
      ) : (
        <>
          <ul className="lg:hidden">
            {visible.map((client) => (
              <li key={client.id} className="border-b border-white/10">
                <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px]">
                      {client.inviteCode} · {client.displayName}
                    </p>
                    <p className="truncate text-sm text-[#8e8e93]">
                      {client.company ? `${client.company} · ` : ""}
                      {client.primaryEmail}
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-[#8e8e93]" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden lg:block">
            <div className="grid grid-cols-[7rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-4 border-b border-white/10 pb-2 text-xs uppercase tracking-[0.14em] text-[#8e8e93]">
              <span>Code</span>
              <span>Name</span>
              <span>Company</span>
              <span>Email</span>
              <span />
            </div>
            <ul>
              {visible.map((client) => (
                <li key={client.id} className="border-b border-white/10">
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="grid grid-cols-[7rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-4 py-4 hover:bg-white/5"
                  >
                    <p className="font-mono text-sm text-[#c7c7cc]">{client.inviteCode}</p>
                    <p className="truncate text-[15px]">{client.displayName}</p>
                    <p className="truncate text-sm text-[#8e8e93]">{client.company ?? "—"}</p>
                    <p className="truncate text-sm text-[#8e8e93]">{client.primaryEmail}</p>
                    <ChevronRight className="size-5 justify-self-end text-[#8e8e93]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
