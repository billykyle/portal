import { Field, SubmitButton } from "@/components/field";
import { attachShoot } from "@/lib/actions/admin";

export function AttachShootForm({
  clientId,
}: {
  clientId: string;
}) {
  return (
    <form action={attachShoot} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm leading-6 text-[#8e8e93]">
        Files come from the NAS Client Deliverables tree only. This does not invent
        placeholder photos.
      </p>
      <Field id="shotDate" label="Date" type="date" required />
      <Field id="address" label="Address" required autoComplete="off" />
      <Field id="dropboxUrl" label="Dropbox backup URL" type="url" autoComplete="off" />
      <Field
        id="nasRelativePath"
        label="NAS folder"
        placeholder="Sam Lepore/2026.09.04 - 12 Wood View Drive"
        autoComplete="off"
        required
      />
      <p className="text-xs leading-5 text-[#8e8e93]">
        Must match a folder on the share. Photos come from Final or Photos, floor
        plans from Floor Plan, and video from files at the shoot root (or Video).
        Prefer Sync from NAS on the clients list for the full tree.
      </p>
      <SubmitButton>Attach shoot from NAS</SubmitButton>
    </form>
  );
}
