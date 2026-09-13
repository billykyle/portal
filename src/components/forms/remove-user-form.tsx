"use client";

import { removeUser } from "@/lib/actions/admin";

export function RemoveUserForm({
  clientId,
  userId,
  email,
}: {
  clientId: string;
  userId: string;
  email: string;
}) {
  return (
    <form
      action={removeUser}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove ${email}? They lose this login. The client invite stays, and they can sign up again with the same BK code.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4"
      >
        Remove
      </button>
    </form>
  );
}
