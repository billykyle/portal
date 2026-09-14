import Link from "next/link";
import { InviteForm } from "@/components/forms/invite-form";
import { SplashScreen } from "@/components/splash-screen";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SplashPage() {
  const session = await getSession();
  if (session) {
    redirect("/library");
  }

  return (
    <SplashScreen subtitle="Client Portal">
      <InviteForm />
      <p className="mt-6 text-center text-[13px] tracking-normal text-[#8e8e93]">
        Already have an account?{" "}
        <Link href="/signin" className="text-[#8e8e93]">
          Sign in
        </Link>
      </p>
    </SplashScreen>
  );
}
