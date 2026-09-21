"use client";

import Form from "next/form";
import { useState, type FormEvent, type ReactNode } from "react";
import { TimesLoadingScreen } from "@/components/times-loading-screen";
import { prefetchAvailability } from "@/lib/scheduling/availability-cache";
import { canPrefetchAvailability, readAvailabilityQuery } from "@/lib/scheduling/times-prefetch";
import { CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

/**
 * GET to /scheduling/times via the Next.js Form so the times route
 * (and its loading UI) takes over immediately after Continue.
 */
export function BookTimesNavigation({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const query = readAvailabilityQuery(new FormData(event.currentTarget));
    if (!canPrefetchAvailability(query)) return;
    setLoading(true);
    void prefetchAvailability(query);
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
