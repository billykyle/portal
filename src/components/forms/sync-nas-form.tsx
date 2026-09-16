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
        NAS is the source of truth. New client folders mint a BK code. New{" "}
        <span className="text-[#c7c7cc]">date - address</span> folders get a public link. Photos come
        from Final or Photos, floor plans from Floor Plan, and video from the shoot folder.
        Files and shoots that are not on the share are removed from the portal. The running app
        also syncs every 10 minutes unless you turn that off.
      </p>
      <p className="font-mono text-xs leading-relaxed text-[#8e8e93]">
        Client Deliverables / {"{client}"} / {"{date}"} - {"{address}"}
      </p>
      <SyncSubmit />
    </form>
  );
}
