"use client";

import { deleteShoot } from "@/lib/actions/admin";

export function DeleteShootForm({
  clientId,
  shootId,
  address,
}: {
  clientId: string;
  shootId: string;
  address: string;
}) {
  return (
    <form
      action={deleteShoot}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete this shoot at ${address}? Photos on it are removed. The client invite stays.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="shootId" value={shootId} />
      <button
        type="submit"
        className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4"
      >
        Delete shoot
      </button>
    </form>
  );
}
