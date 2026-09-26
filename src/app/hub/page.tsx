import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClientHeader } from "@/components/client-header";
import { pageHeadingWrapClass, pageTitleClass, PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CLIENT_LIBRARY, CLIENT_SCHEDULING } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HubPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);

  return (
    <PhoneShell>
      <ClientHeader />
      <div className={pageHeadingWrapClass}>
        <h1 className={pageTitleClass}>
          {client?.displayName ?? "Client portal"}
        </h1>
        {client?.company ? <p className="mt-1 text-sm text-[#8e8e93]">{client.company}</p> : null}
      </div>
      <nav aria-label="Portal" className="grid gap-4 pb-16 lg:grid-cols-2 lg:gap-6">
        <HubOption href={CLIENT_LIBRARY} title="My Content" subtitle="View and download your media" />
        <HubOption href={CLIENT_SCHEDULING} title="Scheduling" subtitle="Book or manage shoots" />
      </nav>
    </PhoneShell>
  );
}

function HubOption({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-white/10 px-6 py-6 hover:bg-white/5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[22px] font-medium leading-tight">{title}</p>
        <p className="mt-1 text-sm text-[#8e8e93]">{subtitle}</p>
      </div>
      <ChevronRight className="size-6 shrink-0 text-[#8e8e93]" />
    </Link>
  );
}
