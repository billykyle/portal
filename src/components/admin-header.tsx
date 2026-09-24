import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { NavMenu } from "@/components/nav-menu";
import { SignOutButton } from "@/components/sign-out-button";

export function AdminHeader({
  backHref = null,
  backLabel = "Back",
}: {
  /** Drill-in back (a client, a booking, the address step). Omit on top-level admin pages. */
  backHref?: string | null;
  backLabel?: string;
}) {
  return (
    <AppHeader
      left={
        <div className="flex min-w-0 items-center gap-1">
          <NavMenu side="admin" />
          {backHref ? (
            <Link href={backHref} className="truncate text-sm text-[#8e8e93]">
              {backLabel}
            </Link>
          ) : null}
        </div>
      }
      right={<SignOutButton admin />}
    />
  );
}
