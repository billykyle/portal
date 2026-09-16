import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { BkMark } from "@/components/logo";
import { FormColumn, PhoneShell } from "@/components/phone-shell";

export default function ForgotPasswordPage() {
  return (
    <PhoneShell>
      <div className="flex items-center justify-between py-6">
        <Link href="/signin" className="text-sm text-[#8e8e93]">
          Back
        </Link>
        <BkMark size="header" />
        <span className="w-10" />
      </div>
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
