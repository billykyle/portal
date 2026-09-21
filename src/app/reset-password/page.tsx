import { AppHeader } from "@/components/app-header";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { FormColumn, pageTitleClass, PhoneShell } from "@/components/phone-shell";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PhoneShell>
      <AppHeader />
      <FormColumn center className="pb-16">
        <h1 className={`${pageTitleClass} mb-6`}>Reset password</h1>
        <ResetPasswordForm token={token ?? ""} />
      </FormColumn>
    </PhoneShell>
  );
}
