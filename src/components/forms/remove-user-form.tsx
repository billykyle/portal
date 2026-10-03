"use client";

import { removeUser } from "@/lib/actions/admin";

export function RemoveUserForm({
  clientId,
  userId,
  email,
  detachOnly = false,
}: {
  clientId: string;
  userId: string;
  email: string;
  /** This login signed up on another client, so Remove drops only this code. */
  detachOnly?: boolean;
}) {
  const message = detachOnly
    ? `Remove ${email} from this client? Their login still opens the client they signed up with.`
    : `Remove ${email}? They lose this login. The client invite stays, and they can sign up again with the same BK code.`;
  return (
    <form
      action={removeUser}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
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
