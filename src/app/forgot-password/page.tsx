import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { FormColumn, pageTitleClass, PhoneShell } from "@/components/phone-shell";

export default function ForgotPasswordPage() {
  return (
    <PhoneShell>
      <AppHeader
        left={
          <Link href="/signin" className="text-sm text-[#8e8e93]">
            Back
          </Link>
        }
      />
      <FormColumn center className="pb-16">
        <h1 className={`${pageTitleClass} mb-2`}>Forgot password</h1>
        <p className="mb-6 text-sm text-[#8e8e93]">
          Enter the email on your account. We will send a reset link.
        </p>
        <ForgotPasswordForm />
      </FormColumn>
    </PhoneShell>
  );
}
