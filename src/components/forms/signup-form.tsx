"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, inviteCode }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not create that account.");
        return;
      }
      router.push("/library");
      router.refresh();
    } catch {
      setError("Could not create that account. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-[#8e8e93]">
        Invite {inviteCode}
      </p>
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required minLength={8} />
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl border-0 bg-white text-base font-medium text-black hover:bg-white/90 disabled:bg-[#c7c7cc] disabled:text-black/45 disabled:opacity-100"
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-[#8e8e93]">
        Already have an account?{" "}
        <Link href="/signin" className="text-white">
          Sign in
        </Link>
      </p>
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
