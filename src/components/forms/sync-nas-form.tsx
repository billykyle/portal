"use client";

import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/components/field";
import { syncNasFromAdmin } from "@/lib/actions/admin";

function SyncSubmit() {
  const { pending } = useFormStatus();
  return <SubmitButton disabled={pending}>{pending ? "Syncing…" : "Sync from NAS"}</SubmitButton>;
}

export function SyncNasForm() {
  return (
    <form action={syncNasFromAdmin} className="flex flex-col gap-3">
      <p className="text-sm text-[#8e8e93]">
        Walks the share. New client folders mint a BK code. New{" "}
        <span className="text-[#c7c7cc]">date - address</span> folders get a public link. Stills come
        from Final or Photos.
      </p>
      <p className="font-mono text-xs leading-relaxed text-[#8e8e93]">
        Client Deliverables / {"{client}"} / {"{date}"} - {"{address}"}
      </p>
      <SyncSubmit />
    </form>
  );
}
