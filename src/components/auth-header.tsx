import Link from "next/link";
import { AppHeader } from "@/components/app-header";
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
    <AppHeader
      left={
        <div className="min-w-0">
          <p className="truncate text-[17px] font-medium leading-snug text-white">
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
      }
    />
  );
}
