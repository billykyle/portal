import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/forms/admin-login-form";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { getAdminSession } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  if (await getAdminSession()) {
    redirect("/admin/clients");
  }

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col items-center justify-center pt-[8vh]">
        <BkMark className="w-24" />
        <p className="mt-4 text-[15px] text-[#c7c7cc]">Admin</p>
      </div>
      <div className="pb-16">
        <AdminLoginForm />
      </div>
    </PhoneShell>
  );
}
