"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/field";
import { changePassword } from "@/lib/actions/auth";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" autoComplete="off">
      <Field
        id="currentPassword"
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        id="password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <Field
        id="confirm"
        name="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <FormError message={state?.error} />
      <FormSuccess message={state?.success} />
      <SubmitButton disabled={pending}>{pending ? "Updating…" : "Update password"}</SubmitButton>
    </form>
  );
}
