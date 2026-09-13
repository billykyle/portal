import { Field } from "@/components/field";
import { deleteClient } from "@/lib/actions/admin";

export function DeleteClientForm({
  clientId,
  inviteCode,
}: {
  clientId: string;
  inviteCode: string;
}) {
  return (
    <form action={deleteClient} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm leading-6 text-[#8e8e93]">
        This deletes the {inviteCode} client record — not just one teammate login.
        Teammate accounts, attached shoots, and photos go with it. The invite code
        is gone. If the NAS folder is still there, the next sync will mint a new BK
        code for that name. Remove a single login above if you only need to kick one
        person.
      </p>
      <Field
        id="confirmCode"
        label={`Type ${inviteCode}`}
        autoComplete="off"
        required
      />
      <Field id="confirmDelete" label="Type DELETE" autoComplete="off" required />
      <button
        type="submit"
        className="flex h-12 w-full items-center justify-center rounded-xl border border-white/25 text-base text-white"
      >
        Delete client
      </button>
    </form>
  );
}
