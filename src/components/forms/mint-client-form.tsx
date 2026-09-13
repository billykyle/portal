import { Field, SubmitButton } from "@/components/field";
import { mintClient } from "@/lib/actions/admin";

export function MintClientForm({
  minted,
}: {
  minted?: string;
}) {
  return (
    <form action={mintClient} className="flex flex-col gap-4" autoComplete="off">
      <Field id="displayName" label="Display name" required autoComplete="off" />
      <Field id="primaryEmail" label="Primary contact email" type="email" required autoComplete="off" />
      <Field id="company" label="Company" autoComplete="off" />
      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-[16px] font-normal text-white">
          Internal notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          autoComplete="off"
          className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
        />
      </div>
      {minted ? <p className="text-sm text-white">Minted {minted}.</p> : null}
      <SubmitButton>Mint next BK code</SubmitButton>
    </form>
  );
}
