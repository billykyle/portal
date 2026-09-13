import Link from "next/link";
import { BkMark } from "@/components/logo";
import { welcomeClientLabel } from "@/lib/welcome";

export function AuthHeader({
  backHref = "/",
  clientName,
}: {
  backHref?: string;
  clientName?: string | null;
}) {
  const greeting = welcomeClientLabel(clientName);
  const named = greeting !== "Welcome";

  return (
    <header className="flex items-start justify-between gap-4 py-6">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium leading-snug text-white">
          {named ? (
            <>
              Welcome, <span className="font-semibold">{clientName?.trim()}</span>
            </>
          ) : (
            "Welcome"
          )}
        </p>
        <Link href={backHref} className="mt-2 inline-block text-sm text-[#8e8e93]">
          Back
        </Link>
      </div>
      <BkMark size="header" className="shrink-0" />
    </header>
  );
}
