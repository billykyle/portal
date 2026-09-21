"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookTimesForm } from "@/components/forms/book-times-form";
import { TimesHelpNote } from "@/components/times-help-note";
import { TimesStepSummary } from "@/components/times-step-summary";
import { TimesLoadingStatus } from "@/components/times-loading-screen";
import { lastGoodAvailability, peekAvailability, requestAvailability } from "@/lib/scheduling/availability-cache";
import type { AvailabilityResult } from "@/lib/scheduling/availability";
import type { OfferedAvailabilityFailureKind } from "@/lib/scheduling/load-offered-availability";
import { availabilityQueryKey, displayedTimesState, type AvailabilityQuery } from "@/lib/scheduling/times-prefetch";
import { adminBookingHref, schedulingBookHref } from "@/lib/scheduling/urls";
import Link from "next/link";

export function BookTimesPanel({
  address,
  placeId,
  services,
  notes = "",
  error,
  modifyBookingId,
  currentSlot,
  fromAdmin = false,
}: {
  address: string;
  placeId?: string;
  services: string[];
  notes?: string;
  error?: string;
  modifyBookingId?: string;
  currentSlot?: string;
  fromAdmin?: boolean;
}) {
  const router = useRouter();
  const query = useMemo<AvailabilityQuery>(
    () => ({ address, placeId, services, modify: modifyBookingId }),
    [address, placeId, services, modifyBookingId],
  );
  const queryKey = availabilityQueryKey(query);
  const cached = peekAvailability(query);
  const [completed, setCompleted] = useState<{
    key: string;
    availability: AvailabilityResult | null;
    error: { kind: OfferedAvailabilityFailureKind; error: string } | null;
  } | null>(null);
  const current = completed?.key === queryKey ? completed.availability : cached;
  const sourceError = completed?.key === queryKey ? completed.error : null;
  const loading = completed?.key !== queryKey && !cached;
  const previous = lastGoodAvailability();

  useEffect(() => {
    let cancelled = false;
    void requestAvailability(query)
      .then((result) => {
        if (cancelled || result.error === "aborted") return;
        if (result.availability) {
          setCompleted({ key: queryKey, availability: result.availability, error: null });
          return;
        }
        setCompleted({
          key: queryKey,
          availability: null,
          error: result.error
            ? { kind: result.kind ?? "calendar", error: result.error }
            : { kind: "calendar", error: "Times cannot be loaded right now." },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCompleted({
          key: queryKey,
          availability: null,
          error: { kind: "calendar", error: "Times cannot be loaded right now." },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [query, queryKey]);

  const changeHref =
    fromAdmin && modifyBookingId
      ? adminBookingHref(modifyBookingId, {
          address,
          placeId: placeId || null,
          services,
          notes: notes || null,
        })
      : schedulingBookHref({
          address,
          placeId: placeId || null,
          services,
          notes: notes || null,
          modify: modifyBookingId || null,
        });

  useEffect(() => {
    if (!sourceError) return;
    if (sourceError.kind === "address" || sourceError.kind === "availability") {
      router.replace(
        fromAdmin && modifyBookingId
          ? adminBookingHref(modifyBookingId, {
              address,
              placeId: placeId || null,
              services,
              notes: notes || null,
              error: sourceError.error,
            })
          : schedulingBookHref({
              address,
              placeId: placeId || null,
              services,
              notes: notes || null,
              modify: modifyBookingId || null,
              error: sourceError.error,
            }),
      );
    }
  }, [address, fromAdmin, modifyBookingId, notes, placeId, router, services, sourceError]);

  const display = displayedTimesState({ loading, current, previous });

  if (display.showLoadingScreen) {
    return <TimesLoadingStatus />;
  }

  if (sourceError?.kind === "calendar" && !display.availability) {
    return (
      <TimesUnavailable address={address} services={services} changeHref={changeHref} message={sourceError.error} />
    );
  }

  if (!display.availability) {
    return <TimesLoadingStatus />;
  }

  return (
    <BookTimesForm
      availability={display.availability}
      services={services}
      notes={notes}
      error={error}
      modifyBookingId={modifyBookingId}
      currentSlot={currentSlot}
      refreshing={display.refreshing}
      stale={display.stale}
      fromAdmin={fromAdmin}
    />
  );
}

function TimesUnavailable({
  address,
  services,
  changeHref,
  message,
}: {
  address: string;
  services: string[];
  changeHref: string;
  message?: string;
}) {
  return (
    <div>
      <TimesStepSummary address={address} services={services} />
      <Link href={changeHref} className="mt-2 inline-block text-sm text-[#8e8e93] underline">
        Change services or address
      </Link>
      <TimesHelpNote />
      <p className="mt-8 text-sm text-[#8e8e93]">
        {message?.trim() || "Times cannot be loaded until calendar lookup is back."}
      </p>
    </div>
  );
}
