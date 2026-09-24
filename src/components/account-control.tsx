"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLIENT_ACCOUNT } from "@/lib/routes";

export function AccountControl() {
  const pathname = usePathname() ?? "";
  const active = pathname === CLIENT_ACCOUNT || pathname.startsWith(`${CLIENT_ACCOUNT}/`);
  return (
    <Link
      href={CLIENT_ACCOUNT}
      aria-current={active ? "page" : undefined}
      className={active ? "text-sm text-white" : "text-sm text-[#8e8e93]"}
    >
      Account
    </Link>
  );
}
