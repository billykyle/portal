import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { pageStackClass, PhoneShell, sectionLabelTextClass } from "@/components/phone-shell";
import { ADMIN_HOME_LINKS, adminHomeDestination } from "@/lib/admin/home-links";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";

export const metadata: Metadata = {
  title: "Home",
};

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const destination = adminHomeDestination(await searchParams);
  if (destination) redirect(destination);
  await ensureDb();

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Home</h1>
      <nav aria-label="Home" className={pageStackClass}>
        <ul>
          {ADMIN_HOME_LINKS.map((item) => (
            <li key={item.id} className="border-b border-white/10">
              <Link
                href={item.href}
                className="flex min-h-12 w-full items-center justify-between gap-4 py-3 text-left"
              >
                <span className={sectionLabelTextClass}>{item.label}</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[#8e8e93]" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </PhoneShell>
  );
}
