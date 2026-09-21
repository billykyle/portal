"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { adminLogin } from "@/lib/actions/admin-session";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLogin, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="password" label="Admin password" type="password" autoComplete="current-password" required />
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Signing in…" : "Continue"}</SubmitButton>
    </form>
  );
}
