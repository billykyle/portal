import { Field, SubmitButton } from "@/components/field";
import { updateClient } from "@/lib/actions/admin";

export function EditClientForm({
  client,
}: {
  client: {
    id: string;
    inviteCode: string;
    displayName: string;
    primaryEmail: string;
    company: string | null;
    notes: string | null;
  };
}) {
  return (
    <form action={updateClient} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="clientId" value={client.id} />
      <p className="text-sm leading-6 text-[#8e8e93]">
        Invite {client.inviteCode} is the client key. It is not edited here, so NAS
        sync keeps matching this record.
      </p>
      <Field
        id="displayName"
        label="Display name"
        defaultValue={client.displayName}
        required
        autoComplete="off"
      />
      <p className="text-xs leading-5 text-[#8e8e93]">
        NAS sync matches folders by display name. If you rename this and the share
        folder still uses the old name, the next sync will mint a new BK code.
      </p>
      <Field
        id="primaryEmail"
        label="Primary contact email"
        type="email"
        defaultValue={client.primaryEmail}
        required
        autoComplete="off"
      />
      <Field
        id="company"
        label="Company"
        defaultValue={client.company ?? ""}
        autoComplete="off"
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-[16px] font-normal text-white">
          Internal notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={client.notes ?? ""}
          autoComplete="off"
          className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
        />
      </div>
      <SubmitButton>Save client</SubmitButton>
    </form>
  );
}
