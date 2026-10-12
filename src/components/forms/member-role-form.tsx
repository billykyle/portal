import { updateMemberRole } from "@/lib/actions/admin";
import type { ClientCategory } from "@/lib/client-category";
import {
  memberRoleLabel,
  memberRoleNeedsReassignment,
  rolesForCategory,
} from "@/lib/member-role";

export function MemberRoleForm({
  clientId,
  userId,
  category,
  role,
}: {
  clientId: string;
  userId: string;
  category: ClientCategory;
  role: string | null;
}) {
  const options = rolesForCategory(category);
  const needsReassignment = memberRoleNeedsReassignment(category, role);
  const selectId = `role-${userId}`;
  return (
    <form action={updateMemberRole} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor={selectId} className="text-xs uppercase tracking-[0.14em] text-[#8e8e93]">
        Role
      </label>
      <select
        id={selectId}
        name="role"
        defaultValue={role ?? ""}
        className="h-10 min-w-36 appearance-none rounded-xl border-0 bg-[#1c1c1e] px-3 text-sm text-white outline-none"
      >
        <option value="">—</option>
        {options.map((value) => (
          <option key={value} value={value}>
            {memberRoleLabel(value)}
          </option>
        ))}
        {needsReassignment && role ? (
          <option value={role}>{memberRoleLabel(role)} — needs reassignment</option>
        ) : null}
      </select>
      <button type="submit" className="text-sm text-white underline decoration-white/20 underline-offset-4">
        Save
      </button>
      {needsReassignment ? <span className="text-xs text-[#a1a1a1]">Needs reassignment</span> : null}
    </form>
  );
}
