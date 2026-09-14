import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/forms/admin-login-form";
import { SplashScreen } from "@/components/splash-screen";
import { getAdminSession } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  if (await getAdminSession()) {
    redirect("/admin/clients");
  }

  return (
    <SplashScreen subtitle="Admin">
      <AdminLoginForm />
    </SplashScreen>
  );
}
