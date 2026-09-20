import Link from "next/link";
import { AccountControl } from "@/components/account-control";
import { AppHeader } from "@/components/app-header";
import { CLIENT_HOME } from "@/lib/routes";

export function ClientHeader({
  backHref = CLIENT_HOME,
  backLabel = "Home",
}: {
  backHref?: string | null;
  backLabel?: string;
}) {
  return (
    <AppHeader
      left={
        backHref ? (
          <Link href={backHref} className="text-sm text-[#8e8e93]">
            {backLabel}
          </Link>
        ) : undefined
      }
      right={<AccountControl />}
    />
  );
}
