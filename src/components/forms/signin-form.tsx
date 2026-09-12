"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { signIn } from "@/lib/actions/auth";

export function SigninForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field id="password" label="Password" type="password" autoComplete="current-password" required />
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Signing in…" : "Sign in"}</SubmitButton>
      <p className="text-center text-sm text-[#8e8e93]">
        <Link href="/forgot-password" className="text-[#8e8e93]">
          Forgot password?
        </Link>
      </p>
      <p className="text-center text-sm text-[#8e8e93]">
        New here?{" "}
        <Link href="/" className="text-white">
          Enter an invite code
        </Link>
      </p>
    </form>
  );
}
