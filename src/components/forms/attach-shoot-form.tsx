"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AttachShootForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [usePlaceholder, setUsePlaceholder] = useState(true);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await fetch("/api/admin/shoots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          shotDate: String(form.get("shotDate") ?? ""),
          address: String(form.get("address") ?? ""),
          dropboxUrl: String(form.get("dropboxUrl") ?? ""),
          nasRelativePath: String(form.get("nasRelativePath") ?? ""),
          mediaPaths: String(form.get("mediaPaths") ?? ""),
          usePlaceholderMedia: usePlaceholder,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not attach that shoot.");
        return;
      }
      event.currentTarget.reset();
      setUsePlaceholder(true);
      router.refresh();
    } catch {
      setError("Could not attach that shoot. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="shotDate" label="Date" type="date" required />
      <Field id="address" label="Address" required />
      <Field id="dropboxUrl" label="Dropbox backup URL" type="url" />
      <Field id="nasRelativePath" label="NAS folder (optional)" placeholder="Client / 2026-09-04 - 123 Main" />
      <label className="flex items-center gap-3 text-sm text-[#c7c7cc]">
        <input
          type="checkbox"
          checked={usePlaceholder}
          onChange={(event) => setUsePlaceholder(event.target.checked)}
          className="size-4 accent-white"
        />
        Use sample placeholder media
      </label>
      {!usePlaceholder ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="mediaPaths" className="text-[16px] font-normal text-white">
            Media paths
          </Label>
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
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl border-0 bg-white text-base font-medium text-black hover:bg-white/90 disabled:bg-[#c7c7cc] disabled:text-black/45 disabled:opacity-100"
      >
        {pending ? "Saving…" : "Attach shoot"}
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
