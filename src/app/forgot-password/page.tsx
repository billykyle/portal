import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";

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
      <h1 className="mb-2 text-2xl font-medium">Forgot password</h1>
      <p className="mb-6 text-sm text-[#8e8e93] md:max-w-md">
        Enter the email on your account. We will send a reset link.
      </p>
      <FormColumn>
        <ForgotPasswordForm />
      </FormColumn>
    </PhoneShell>
  );
}
