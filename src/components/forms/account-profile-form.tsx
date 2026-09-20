"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/field";
import { updateProfile } from "@/lib/actions/auth";

export function AccountProfileForm({
  firstName,
  lastName,
  companyName,
  phone,
  email,
}: {
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        id="firstName"
        name="firstName"
        label="First name"
        autoComplete="given-name"
        defaultValue={firstName}
        required
      />
      <Field
        id="lastName"
        name="lastName"
        label="Last name"
        autoComplete="family-name"
        defaultValue={lastName}
        required
      />
      <Field
        id="companyName"
        name="companyName"
        label="Company name"
        autoComplete="organization"
        defaultValue={companyName}
        required
      />
      <Field
        id="phone"
        name="phone"
        label="Phone number"
        type="tel"
        autoComplete="tel"
        defaultValue={phone}
        required
      />
      <div className="flex flex-col gap-2">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={email}
          readOnly
          className="text-[#8e8e93]"
        />
        <p className="text-sm text-[#8e8e93]">
          Email is your sign-in and stays on this account. Contact Billy if you need it changed.
        </p>
      </div>
      <FormError message={state?.error} />
      <FormSuccess message={state?.success} />
      <SubmitButton disabled={pending}>{pending ? "Saving…" : "Save profile"}</SubmitButton>
    </form>
  );
}
