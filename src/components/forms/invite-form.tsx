"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeInviteCode } from "@/lib/invite";

export function InviteForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const ready = normalizeInviteCode(code).length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "That invite code was not found.");
        return;
      }
      router.push("/signup");
    } catch {
      setError("Could not check that code. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite" className="text-[16px] font-normal text-white">
          Invite Code
        </Label>
        <Input
          id="invite"
          name="code"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="h-12 rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-[#1c1c1e]"
        />
      </div>
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
      <Button
        type="submit"
        disabled={!ready || pending}
        className="h-12 w-full rounded-xl border-0 bg-white text-base font-medium text-black hover:bg-white/90 disabled:bg-[#c7c7cc] disabled:text-black/45 disabled:opacity-100"
      >
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
