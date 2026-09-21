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
      <SyncSubmit />
    </form>
  );
}
