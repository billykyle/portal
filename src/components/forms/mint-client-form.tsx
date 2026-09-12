"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { mintClient } from "@/lib/actions/admin";

export function MintClientForm() {
  const [state, action, pending] = useActionState(mintClient, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="displayName" label="Display name" required />
      <Field id="primaryEmail" label="Primary contact email" type="email" required />
      <Field id="company" label="Company" />
      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-[16px] font-normal text-white">
          Internal notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
        />
      </div>
      <FormError message={state?.error} />
      {state?.minted ? <p className="text-sm text-white">Minted {state.minted}.</p> : null}
      <SubmitButton disabled={pending}>{pending ? "Minting…" : "Mint next BK code"}</SubmitButton>
    </form>
  );
}
