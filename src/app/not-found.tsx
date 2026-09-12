import Link from "next/link";
import { PhoneShell } from "@/components/phone-shell";

export default function NotFound() {
  return (
    <PhoneShell className="items-start justify-center">
      <div className="py-24">
        <h1 className="text-2xl font-medium">Not found</h1>
        <p className="mt-2 text-sm text-[#8e8e93]">That page is not in this portal.</p>
        <Link href="/" className="mt-6 inline-block text-white underline">
          Back to the start
        </Link>
      </div>
    </PhoneShell>
  );
}
