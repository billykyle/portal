"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MintClientForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [minted, setMinted] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMinted(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: String(form.get("displayName") ?? ""),
          primaryEmail: String(form.get("primaryEmail") ?? ""),
          company: String(form.get("company") ?? ""),
          notes: String(form.get("notes") ?? ""),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        client?: { inviteCode: string };
      };
      if (!response.ok) {
        setError(data.error ?? "Could not mint that client.");
        return;
      }
      setMinted(data.client?.inviteCode ?? null);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Could not mint that client. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="displayName" label="Display name" required />
      <Field id="primaryEmail" label="Primary contact email" type="email" required />
      <Field id="company" label="Company" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes" className="text-[16px] font-normal text-white">
          Internal notes
        </Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
        />
      </div>
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
      {minted ? <p className="text-sm text-white">Minted {minted}.</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl border-0 bg-white text-base font-medium text-black hover:bg-white/90 disabled:bg-[#c7c7cc] disabled:text-black/45 disabled:opacity-100"
      >
        {pending ? "Minting…" : "Mint next BK code"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-[16px] font-normal text-white">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        className="h-12 rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white shadow-none focus-visible:ring-0 dark:bg-[#1c1c1e]"
        {...props}
      />
    </div>
  );
}
