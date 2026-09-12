import { Field, FormError, SubmitButton } from "@/components/field";
import { attachShoot } from "@/lib/actions/admin";

export function AttachShootForm({
  clientId,
  error,
  attached,
}: {
  clientId: string;
  error?: string;
  attached?: boolean;
}) {
  return (
    <form action={attachShoot} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="clientId" value={clientId} />
      <Field id="shotDate" label="Date" type="date" required />
      <Field id="address" label="Address" required autoComplete="off" />
      <Field id="dropboxUrl" label="Dropbox backup URL" type="url" autoComplete="off" />
      <Field
        id="nasRelativePath"
        label="NAS folder (optional)"
        placeholder="Client / 2026-09-04 - 123 Main"
        autoComplete="off"
      />
      <label className="flex items-center gap-3 text-sm text-[#c7c7cc]">
        <input type="checkbox" name="usePlaceholderMedia" defaultChecked className="size-4 accent-white" />
        Use sample placeholder media
      </label>
      <div className="flex flex-col gap-2">
        <label htmlFor="mediaPaths" className="text-[16px] font-normal text-white">
          Media paths
        </label>
        <textarea
          id="mediaPaths"
          name="mediaPaths"
          rows={4}
          placeholder={"photos/01-exterior.jpg\nvideo/walkthrough.mp4\nplans/level-1.jpg"}
          className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
        />
        <p className="text-xs text-[#8e8e93]">
          Ignored when sample media is checked. Relative paths resolve against NAS_BASE_URL when
          NAS_ENABLED=true.
        </p>
      </div>
      <FormError message={error} />
      {attached ? <p className="text-sm text-white">Shoot attached.</p> : null}
      <SubmitButton>Attach shoot</SubmitButton>
    </form>
  );
}
