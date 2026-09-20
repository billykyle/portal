"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { signUp } from "@/lib/actions/auth";

export function SignupForm({
  inviteCode,
  defaultEmail,
  defaultCompany,
  emailLocked = false,
}: {
  inviteCode: string;
  defaultEmail?: string;
  defaultCompany?: string;
  emailLocked?: boolean;
}) {
  const [state, action, pending] = useActionState(signUp, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-[#8e8e93]">Invite {inviteCode}</p>
      <input type="hidden" name="inviteCode" value={inviteCode} />
      <Field id="firstName" name="firstName" label="First name" autoComplete="given-name" required />
      <Field id="lastName" name="lastName" label="Last name" autoComplete="family-name" required />
      <Field
        id="companyName"
        name="companyName"
        label="Company name"
        autoComplete="organization"
        defaultValue={defaultCompany}
        required
      />
      <Field id="phone" name="phone" label="Phone number" type="tel" autoComplete="tel" required />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={defaultEmail}
        required
        readOnly={emailLocked}
      />
      <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required minLength={8} />
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Creating account…" : "Create account"}</SubmitButton>
      <p className="text-center text-sm text-[#8e8e93]">
        Already have an account?{" "}
        <Link href="/signin" className="text-white">
          Sign in
        </Link>
      </p>
    </form>
  );
}
