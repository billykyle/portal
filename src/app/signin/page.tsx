import Link from "next/link";
import { redirect } from "next/navigation";
import { SigninForm } from "@/components/forms/signin-form";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { getSession } from "@/lib/auth";

export default async function SigninPage() {
  if (await getSession()) {
    redirect("/library");
  }

  return (
    <PhoneShell>
      <div className="flex items-center justify-between py-6">
        <Link href="/" className="text-sm text-[#8e8e93]">
          Back
        </Link>
        <BkMark className="h-7 w-10 text-white" />
        <span className="w-10" />
      </div>
      <h1 className="mb-6 text-2xl font-medium">Sign in</h1>
      <SigninForm />
    </PhoneShell>
  );
}
