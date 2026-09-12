"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { resetPassword } from "@/lib/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  if (!token) {
    return (
      <p className="text-sm text-[#a1a1a1]">
        This reset link is missing. Request a new one from{" "}
        <Link href="/forgot-password" className="text-white">
          forgot password
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" type="password" autoComplete="new-password" required minLength={8} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required minLength={8} />
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Saving…" : "Update password"}</SubmitButton>
    </form>
  );
}
