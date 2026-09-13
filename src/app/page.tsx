import Link from "next/link";
import { InviteForm } from "@/components/forms/invite-form";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SplashPage() {
  const session = await getSession();
  if (session) {
    redirect("/library");
  }

  return (
    <PhoneShell className="px-6">
      <div className="flex flex-1 flex-col items-center justify-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full flex-col items-center">
          <BkMark size="splash" />
          <p className="mt-4 text-[15px] font-normal tracking-normal text-[#c7c7cc]">
            Client Portal
          </p>
          <div className="mt-16 w-full">
            <InviteForm />
            <p className="mt-6 text-center text-[13px] tracking-normal text-[#8e8e93]">
              Already have an account?{" "}
              <Link href="/signin" className="text-[#8e8e93]">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
