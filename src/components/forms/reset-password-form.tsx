"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not reset that password.");
        return;
      }
      router.push("/signin");
    } catch {
      setError("Could not reset that password. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-[#a1a1a1]">
        This reset link is missing. Request a new one from{" "}
        <Link href="/forgot-password" className="text-white">
          forgot password
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="password" label="New password" type="password" autoComplete="new-password" required minLength={8} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required minLength={8} />
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl border-0 bg-white text-base font-medium text-black hover:bg-white/90 disabled:bg-[#c7c7cc] disabled:text-black/45 disabled:opacity-100"
      >
        {pending ? "Saving…" : "Update password"}
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
