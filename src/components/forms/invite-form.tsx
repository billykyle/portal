"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { redeemInvite } from "@/lib/actions/auth";

export function InviteForm() {
  const [state, action, pending] = useActionState(redeemInvite, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        id="code"
        label="Invite Code"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        required
        className="uppercase"
      />
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Checking…" : "Continue"}</SubmitButton>
    </form>
  );
}
