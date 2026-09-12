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
      <div className="flex flex-1 flex-col items-center justify-center pt-[8vh]">
        <BkMark className="h-[104px] w-[148px] text-white" />
        <p className="mt-4 text-[15px] font-normal text-[#c7c7cc]">Client Portal</p>
      </div>
      <div className="pb-6">
        <InviteForm />
        <p className="mt-6 text-center text-[13px] text-[#8e8e93]">
          Already have an account?{" "}
          <Link href="/signin" className="text-[#8e8e93]">
            Sign in
          </Link>
        </p>
      </div>
      <div className="h-[8vh]" />
    </PhoneShell>
  );
}
