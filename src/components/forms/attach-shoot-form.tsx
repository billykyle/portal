"use client";

import { useActionState, useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { attachShoot } from "@/lib/actions/admin";

export function AttachShootForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(attachShoot, undefined);
  const [usePlaceholder, setUsePlaceholder] = useState(true);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <Field id="shotDate" label="Date" type="date" required />
      <Field id="address" label="Address" required />
      <Field id="dropboxUrl" label="Dropbox backup URL" type="url" />
      <Field id="nasRelativePath" label="NAS folder (optional)" placeholder="Client / 2026-09-04 - 123 Main" />
      <label className="flex items-center gap-3 text-sm text-[#c7c7cc]">
        <input
          type="checkbox"
          name="usePlaceholderMedia"
          checked={usePlaceholder}
          onChange={(event) => setUsePlaceholder(event.target.checked)}
          className="size-4 accent-white"
        />
        Use sample placeholder media
      </label>
      {!usePlaceholder ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="mediaPaths" className="text-[16px] font-normal text-white">
            Media paths
          </label>
          <textarea
            id="mediaPaths"
            name="mediaPaths"
            rows={5}
            placeholder={"photos/01-exterior.jpg\nvideo/walkthrough.mp4\nplans/level-1.jpg"}
            className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
          />
          <p className="text-xs text-[#8e8e93]">
            One path per line. Relative paths resolve against NAS_BASE_URL when NAS_ENABLED=true.
          </p>
        </div>
      ) : null}
      <FormError message={state?.error} />
      <SubmitButton disabled={pending}>{pending ? "Saving…" : "Attach shoot"}</SubmitButton>
    </form>
  );
}
