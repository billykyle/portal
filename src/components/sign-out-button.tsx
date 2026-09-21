import { adminLogout } from "@/lib/actions/admin-session";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton({ admin = false }: { admin?: boolean }) {
  return (
    <form action={admin ? adminLogout : signOut}>
      <button type="submit" className="text-sm text-[#8e8e93]">
        Sign out
      </button>
    </form>
  );
}
