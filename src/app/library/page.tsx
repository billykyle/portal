import { desc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { shoots } from "@/lib/db/schema";
import { formatShootDate } from "@/lib/media";

export default async function LibraryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const rows = await db
    .select()
    .from(shoots)
    .where(eq(shoots.clientId, session.clientId))
    .orderBy(desc(shoots.shotDate), desc(shoots.createdAt));

  return (
    <PhoneShell>
      <header className="flex items-center justify-between py-6">
        <BkMark className="h-7 w-10 text-white" />
        <SignOutButton />
      </header>
      <div className="mb-6">
        <h1 className="text-2xl font-medium">Your shoots</h1>
        <p className="mt-1 text-sm text-[#8e8e93]">{session.inviteCode}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">
          No shoots yet. Your photographer will post them here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((shoot) => (
            <li key={shoot.id} className="border-b border-white/10">
              <Link href={`/shoots/${shoot.id}`} className="flex items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{formatShootDate(shoot.shotDate)}</p>
                  <p className="truncate text-sm text-[#8e8e93]">{shoot.address}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-[#8e8e93]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PhoneShell>
  );
}
