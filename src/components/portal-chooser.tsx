import { enterPortal } from "@/lib/actions/auth";
import type { UserPortal } from "@/lib/user-portals";

export function PortalChooser({ portals }: { portals: UserPortal[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium">Choose a portal</h1>
        <p className="mt-2 text-sm leading-6 text-[#8e8e93]">This login opens more than one client.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {portals.map((portal) => (
          <li key={portal.id}>
            <form action={enterPortal}>
              <input type="hidden" name="clientId" value={portal.id} />
              <button
                type="submit"
                className="flex w-full flex-col items-start rounded-2xl border border-white/10 px-6 py-5 text-left hover:bg-white/5"
              >
                <span className="text-[22px] font-medium leading-tight">{portal.displayName}</span>
                <span className="mt-1 text-sm text-[#c7c7cc]">{portal.inviteCode}</span>
                {portal.company ? <span className="mt-1 text-sm text-[#8e8e93]">{portal.company}</span> : null}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
