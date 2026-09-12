"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { requestPasswordReset } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  const sent = Boolean(state && !state.error);

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-sm text-[#a1a1a1]">
        <p>If that email is on file, a reset link is ready.</p>
        {state?.resetUrl ? (
          <p>
            Email sending is not configured, so use this link:{" "}
            <Link href={state.resetUrl} className="break-all text-white underline">
              {state.resetUrl}
            </Link>
          </p>
        ) : (
          <p>Check your inbox for the reset email.</p>
        )}
        <Link href="/signin" className="text-white">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Sending…" : "Send reset link"}</SubmitButton>
      <Link href="/signin" className="text-center text-sm text-[#8e8e93]">
        Back to sign in
      </Link>
    </form>
  );
}
