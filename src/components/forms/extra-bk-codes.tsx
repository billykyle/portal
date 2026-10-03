"use client";

import { Field, SubmitButton } from "@/components/field";
import { sectionLabelClass } from "@/components/phone-shell";
import { addUserCode, removeUserCode } from "@/lib/actions/admin";

export function ExtraBkCodes({
  clientId,
  userId,
  signupCode,
  extras,
}: {
  clientId: string;
  userId: string;
  signupCode: string;
  extras: { id: string; inviteCode: string; displayName: string }[];
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-white/10 pt-8">
      <div>
        <h2 className={sectionLabelClass}>Other BK codes</h2>
        <p className="text-sm leading-6 text-[#8e8e93]">
          This login signed up with {signupCode}. Add another code and the same email can open that
          client. They do not need a second account.
        </p>
      </div>
      <form action={addUserCode} className="flex flex-col gap-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="userId" value={userId} />
        <Field id="code" label="BK code" placeholder="BK00007" autoComplete="off" required />
        <SubmitButton>Add code</SubmitButton>
      </form>
      {extras.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No other codes yet.</p>
      ) : (
        <ul>
          {extras.map((extra) => (
            <li key={extra.id} className="flex items-center gap-3 border-b border-white/10 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{extra.inviteCode}</p>
                <p className="truncate text-sm text-[#8e8e93]">{extra.displayName}</p>
              </div>
              <form
                action={removeUserCode}
                onSubmit={(event) => {
                  if (!window.confirm(`Remove ${extra.inviteCode} from this login?`)) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="removeClientId" value={extra.id} />
                <button
                  type="submit"
                  className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
