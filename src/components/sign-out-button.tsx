"use client";

import { useRouter } from "next/navigation";

export function SignOutButton({ admin = false }: { admin?: boolean }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="text-sm text-[#8e8e93]"
      onClick={async () => {
        await fetch(admin ? "/api/admin/logout" : "/api/auth/signout", { method: "POST" });
        router.push(admin ? "/admin" : "/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
