import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { MintClientForm } from "@/components/forms/mint-client-form";
import { formMeasureClass, pageStackClass, PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db/ensure";

export const metadata: Metadata = {
  title: "Create client",
};

export default async function AdminHomeCreateClientPage({
  searchParams,
}: {
  searchParams: Promise<{ minted?: string; error?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  await ensureDb();
  const { minted, error } = await searchParams;

  return (
    <PhoneShell wide>
      <AdminHeader />
      <h1 className="sr-only">Create client</h1>
      {error ? <p className="mb-6 text-sm text-[#a1a1a1]">{error}</p> : null}
      <div className={`${pageStackClass} ${formMeasureClass}`}>
        <MintClientForm minted={minted} />
      </div>
    </PhoneShell>
  );
}
