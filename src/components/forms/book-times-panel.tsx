"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookTimesForm } from "@/components/forms/book-times-form";
import { BookTwilightPairForm } from "@/components/forms/book-twilight-pair-form";
import { TimesStepHeader } from "@/components/times-step-summary";
import { TimesLoadingStatus } from "@/components/times-loading-screen";
import {
  lastGoodAvailability,
  lastGoodAvailabilityKey,
  peekAvailability,
  requestAvailability,
} from "@/lib/scheduling/availability-cache";
import type { AvailabilityResult } from "@/lib/scheduling/availability";
import type { OfferedAvailabilityFailureKind } from "@/lib/scheduling/load-offered-availability";
import { TWILIGHT_SERVICE } from "@/lib/scheduling/services";
import { twilightBookingFlow } from "@/lib/scheduling/twilight-pair";
import {
  availabilityQueryKey,
  displayedTimesState,
  previousTimesForQuery,
  type AvailabilityQuery,
} from "@/lib/scheduling/times-prefetch";
import { schedulingEditorHref } from "@/lib/scheduling/urls";

function useOfferedAvailability(query: AvailabilityQuery) {
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
  const previous = previousTimesForQuery(queryKey, lastGoodAvailabilityKey(), lastGoodAvailability());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let result = await requestAvailability(query);
      if (!cancelled && result.error === "aborted") {
        result = await requestAvailability(query);
      }
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
    }
    void load().catch(() => {
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

  return { display: displayedTimesState({ loading, current, previous }), sourceError };
}

export function BookTimesPanel({
  address,
  placeId,
  services,
  commercialHours = null,
  notes = "",
  error,
  modifyBookingId,
  currentSlot,
  fromAdmin = false,
}: {
  address: string;
  placeId?: string;
  services: string[];
  commercialHours?: number | null;
  notes?: string;
  error?: string;
  modifyBookingId?: string;
  currentSlot?: string;
  fromAdmin?: boolean;
}) {
  const flow = twilightBookingFlow(services);
  if (flow.kind === "paired" && !modifyBookingId) {
    return (
      <PairedBookTimesPanel
        address={address}
        placeId={placeId}
        services={services}
        regularServices={flow.regular}
        commercialHours={commercialHours}
        notes={notes}
        error={error}
      />
    );
  }
  return (
    <SingleBookTimesPanel
      address={address}
      placeId={placeId}
      services={services}
      commercialHours={commercialHours}
      notes={notes}
      error={error}
      modifyBookingId={modifyBookingId}
      currentSlot={currentSlot}
      fromAdmin={fromAdmin}
    />
  );
}

function SingleBookTimesPanel({
  address,
  placeId,
  services,
  commercialHours = null,
  notes = "",
  error,
  modifyBookingId,
  currentSlot,
  fromAdmin = false,
}: {
  address: string;
  placeId?: string;
  services: string[];
  commercialHours?: number | null;
  notes?: string;
  error?: string;
  modifyBookingId?: string;
  currentSlot?: string;
  fromAdmin?: boolean;
}) {
  const router = useRouter();
  const query = useMemo<AvailabilityQuery>(
    () => ({ address, placeId, services, commercialHours, modify: modifyBookingId }),
    [address, commercialHours, placeId, services, modifyBookingId],
  );
  const { display, sourceError } = useOfferedAvailability(query);
  const changeHref = schedulingEditorHref({ fromAdmin, bookingId: modifyBookingId });

  useEffect(() => {
    if (!sourceError) return;
    if (sourceError.kind === "address" || sourceError.kind === "availability") {
      router.replace(
        schedulingEditorHref({
          fromAdmin,
          bookingId: modifyBookingId,
          error: sourceError.error,
        }),
      );
    }
  }, [fromAdmin, modifyBookingId, router, sourceError]);

  if (display.showLoadingScreen) {
    return <TimesLoadingStatus />;
  }

  if (sourceError?.kind === "calendar" && !display.availability) {
    return <TimesUnavailable address={address} services={services} changeHref={changeHref} message={sourceError.error} />;
  }

  if (!display.availability) {
    return <TimesLoadingStatus />;
  }

  return (
    <BookTimesForm
      availability={display.availability}
      services={services}
      commercialHours={commercialHours}
      notes={notes}
      placeId={placeId}
      error={error}
      modifyBookingId={modifyBookingId}
      currentSlot={currentSlot}
      refreshing={display.refreshing}
      stale={display.stale}
      fromAdmin={fromAdmin}
    />
  );
}

function PairedBookTimesPanel({
  address,
  placeId,
  services,
  regularServices,
  commercialHours = null,
  notes = "",
  error,
}: {
  address: string;
  placeId?: string;
  services: string[];
  regularServices: string[];
  commercialHours?: number | null;
  notes?: string;
  error?: string;
}) {
  const router = useRouter();
  const regularQuery = useMemo<AvailabilityQuery>(
    () => ({ address, placeId, services: regularServices, commercialHours }),
    [address, commercialHours, placeId, regularServices],
  );
  const twilightQuery = useMemo<AvailabilityQuery>(
    () => ({ address, placeId, services: [TWILIGHT_SERVICE], commercialHours: null }),
    [address, placeId],
  );
  const regular = useOfferedAvailability(regularQuery);
  const twilight = useOfferedAvailability(twilightQuery);
  const changeHref = schedulingEditorHref({});
  const sourceError = regular.sourceError ?? twilight.sourceError;

  useEffect(() => {
    if (!sourceError) return;
    if (sourceError.kind === "address" || sourceError.kind === "availability") {
      router.replace(schedulingEditorHref({ error: sourceError.error }));
    }
  }, [router, sourceError]);

  const waiting =
    regular.display.showLoadingScreen ||
    twilight.display.showLoadingScreen ||
    !regular.display.availability ||
    !twilight.display.availability;

  if (waiting) {
    const calendarError =
      regular.sourceError?.kind === "calendar"
        ? regular.sourceError
        : twilight.sourceError?.kind === "calendar"
          ? twilight.sourceError
          : null;
    if (
      calendarError &&
      !regular.display.showLoadingScreen &&
      !twilight.display.showLoadingScreen &&
      (!regular.display.availability || !twilight.display.availability)
    ) {
      return (
        <TimesUnavailable address={address} services={services} changeHref={changeHref} message={calendarError.error} />
      );
    }
    return <TimesLoadingStatus />;
  }

  if (!regular.display.availability || !twilight.display.availability) {
    return <TimesLoadingStatus />;
  }

  return (
    <BookTwilightPairForm
      regularAvailability={regular.display.availability}
      twilightAvailability={twilight.display.availability}
      regularServices={regularServices}
      services={services}
      commercialHours={commercialHours}
      notes={notes}
      placeId={placeId}
      error={error}
      refreshing={regular.display.refreshing || twilight.display.refreshing}
      stale={regular.display.stale || twilight.display.stale}
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
      <TimesStepHeader address={address} services={services} changeHref={changeHref} />
      <p className="mt-8 text-sm text-[#8e8e93]">
        {message?.trim() || "Times cannot be loaded until calendar lookup is back."}
      </p>
    </div>
  );
}
