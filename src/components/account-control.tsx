import Link from "next/link";
import { CLIENT_ACCOUNT } from "@/lib/routes";

export function AccountControl() {
  return (
    <Link href={CLIENT_ACCOUNT} className="text-sm text-[#8e8e93]">
      Account
    </Link>
  );
}
