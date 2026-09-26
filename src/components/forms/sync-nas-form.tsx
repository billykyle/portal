"use client";

import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/components/field";
import { syncNasFromAdmin } from "@/lib/actions/admin";

function SyncSubmit() {
  const { pending } = useFormStatus();
  return <SubmitButton disabled={pending}>{pending ? "Syncing…" : "Sync from NAS"}</SubmitButton>;
}

export function SyncNasForm({
  error,
  status,
  note,
}: {
  error?: string;
  status?: string;
  note?: string;
}) {
  return (
    <form action={syncNasFromAdmin} className="flex flex-col gap-3">
      <SyncSubmit />
      {error ? (
        <p role="alert" className="text-sm text-white">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-white">
          {status}
        </p>
      ) : null}
      {note ? <p className="text-sm text-white">{note}</p> : null}
    </form>
  );
}
