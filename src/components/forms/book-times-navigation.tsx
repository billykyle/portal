"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { TimesLoadingScreen } from "@/components/times-loading-screen";
import { continueToTimes } from "@/lib/actions/scheduling";
import { prefetchAvailability } from "@/lib/scheduling/availability-cache";
import { canPrefetchAvailability, readAvailabilityQuery } from "@/lib/scheduling/times-prefetch";

/**
 * Saves the in-progress shoot on the server, then opens the clean times path.
 * The loading cover shows as soon as Continue is accepted.
 */
export function BookTimesNavigation({
  children,
  action = continueToTimes,
}: {
  children: ReactNode;
  action?: (formData: FormData) => void | Promise<void>;
}) {
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
      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-4">
        {children}
      </form>
    </>
  );
}
