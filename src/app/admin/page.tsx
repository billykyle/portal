import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/forms/admin-login-form";
import { SplashScreen } from "@/components/splash-screen";
import { adminLandingPath } from "@/lib/admin-landing";
import { getAdminSession } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  if (await getAdminSession()) {
    redirect(await adminLandingPath());
  }

  return (
    <SplashScreen subtitle="Admin">
      <AdminLoginForm />
    </SplashScreen>
  );
}
