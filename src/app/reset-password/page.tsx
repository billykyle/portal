import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PhoneShell>
      <div className="flex items-center justify-center py-6">
        <BkMark className="h-7" />
      </div>
      <h1 className="mb-6 text-2xl font-medium">Reset password</h1>
      <ResetPasswordForm token={token ?? ""} />
    </PhoneShell>
  );
}
