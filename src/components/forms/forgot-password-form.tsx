"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "") }),
      });
      const data = (await response.json()) as { error?: string; resetUrl?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not send a reset link.");
        return;
      }
      setSent(true);
      setResetUrl(data.resetUrl ?? null);
    } catch {
      setError("Could not send a reset link. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-sm text-[#a1a1a1]">
        <p>If that email is on file, a reset link is ready.</p>
        {resetUrl ? (
          <p>
            Email sending is not configured, so use this link:{" "}
            <Link href={resetUrl} className="break-all text-white underline">
              {resetUrl}
            </Link>
          </p>
        ) : (
          <p>Check your inbox for the reset email.</p>
        )}
        <Link href="/signin" className="text-white">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-[16px] font-normal text-white">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white shadow-none focus-visible:ring-0 dark:bg-[#1c1c1e]"
        />
      </div>
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl border-0 bg-white text-base font-medium text-black hover:bg-white/90 disabled:bg-[#c7c7cc] disabled:text-black/45 disabled:opacity-100"
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/signin" className="text-center text-sm text-[#8e8e93]">
        Back to sign in
      </Link>
    </form>
  );
}
