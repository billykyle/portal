"use client";

import Form from "next/form";
import { useState, type FormEvent, type ReactNode } from "react";
import { TimesLoadingScreen } from "@/components/times-loading-screen";
import { CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

/**
 * GET to /scheduling/times via the Next.js Form so the times route
 * (and its loading UI) takes over immediately after Continue.
 */
export function BookTimesNavigation({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const services = new FormData(event.currentTarget)
      .getAll("service")
      .filter((value) => String(value).trim());
    if (services.length === 0) return;
    setLoading(true);
  }

  return (
    <>
      {loading ? (
        <div className="fixed inset-0 z-50">
          <TimesLoadingScreen />
        </div>
      ) : null}
      <Form action={CLIENT_SCHEDULING_TIMES} onSubmit={onSubmit} className="flex flex-col gap-4">
        {children}
      </Form>
    </>
  );
}
