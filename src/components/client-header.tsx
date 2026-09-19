import Link from "next/link";
import { BkMark } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { CLIENT_HOME } from "@/lib/routes";

export function ClientHeader({
  backHref = CLIENT_HOME,
  backLabel = "Home",
}: {
  backHref?: string | null;
  backLabel?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-4 py-6">
      {backHref ? (
        <Link href={backHref} className="text-sm text-[#8e8e93]">
          {backLabel}
        </Link>
      ) : (
        <BkMark size="header" />
      )}
      {backHref ? <BkMark size="header" /> : <span className="w-10" />}
      <SignOutButton />
    </header>
  );
}
