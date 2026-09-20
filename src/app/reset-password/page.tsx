import { AppHeader } from "@/components/app-header";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PhoneShell>
      <AppHeader />
      <h1 className="mb-6 text-2xl font-medium">Reset password</h1>
      <FormColumn>
        <ResetPasswordForm token={token ?? ""} />
      </FormColumn>
    </PhoneShell>
  );
}
