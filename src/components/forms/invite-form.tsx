"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { redeemInvite } from "@/lib/actions/auth";
import { normalizeInviteCode } from "@/lib/invite";

export function InviteForm() {
  const [state, action, pending] = useActionState(redeemInvite, undefined);
  const [code, setCode] = useState("");
  const ready = normalizeInviteCode(code).length > 0;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        id="code"
        label="Invite Code"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
      />
      <FormError message={state?.error} />
      <SubmitButton disabled={!ready || pending}>{pending ? "Checking…" : "Continue"}</SubmitButton>
    </form>
  );
}
