"use client";

import { useState } from "react";
import { BookTimesForm } from "@/components/forms/book-times-form";
import type { AvailabilityResult } from "@/lib/scheduling/availability";
import { formatBookingServices } from "@/lib/scheduling/services";
import { preferredTwilightSlot, twilightSlotsBeside } from "@/lib/scheduling/twilight-pair";

export function BookTwilightPairForm({
  regularAvailability,
  twilightAvailability,
  regularServices,
  services,
  commercialHours = null,
  notes = "",
  placeId = "",
  error,
  refreshing = false,
  stale = false,
}: {
  regularAvailability: AvailabilityResult;
  twilightAvailability: AvailabilityResult;
  regularServices: string[];
  services: string[];
  commercialHours?: number | null;
  notes?: string;
  placeId?: string;
  error?: string;
  refreshing?: boolean;
  stale?: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [regularSlot, setRegularSlot] = useState("");
  const regularLabel = formatBookingServices(regularServices);

  if (step === 1) {
    return (
      <BookTimesForm
        availability={regularAvailability}
        services={regularServices}
        postedServices={services}
        commercialHours={commercialHours}
        notes={notes}
        placeId={placeId}
        error={error}
        currentSlot={regularSlot || undefined}
        refreshing={refreshing}
        stale={stale}
        heading="Available times"
        intro={`Step 1 of 2. Choose a time for ${regularLabel}. Twilight is a separate sunset appointment, next.`}
        submitLabel="Continue"
        onAdvance={(slot) => {
          setRegularSlot(slot);
          setStep(2);
        }}
      />
    );
  }

  const chosen = regularAvailability.slots.find((slot) => `${slot.start}|${slot.end}` === regularSlot);
  const openSlots = chosen
    ? twilightSlotsBeside({ start: chosen.start, end: chosen.end }, twilightAvailability.slots)
    : twilightAvailability.slots;
  const preferred = chosen ? preferredTwilightSlot(chosen.dateKey, openSlots) : null;

  return (
    <BookTimesForm
      key={regularSlot}
      availability={{ ...twilightAvailability, slots: openSlots }}
      services={["Real Estate · Twilight"]}
      postedServices={services}
      commercialHours={commercialHours}
      notes={notes}
      placeId={placeId}
      error={error}
      refreshing={refreshing}
      stale={stale}
      heading="Twilight"
      intro="Step 2 of 2. Twilight is 30 minutes at sunset. The same day is highlighted when that sunset is open. Any other open day works."
      slotFieldName="twilightSlot"
      extraHidden={[{ name: "slot", value: regularSlot }]}
      preferredDateKey={preferred?.dateKey}
      defaultSlot={preferred ? `${preferred.start}|${preferred.end}` : ""}
      onBack={() => setStep(1)}
      backLabel="Change the other time"
    />
  );
}
