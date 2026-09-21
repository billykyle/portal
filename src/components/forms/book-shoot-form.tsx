"use client";

import { useEffect, useMemo, useState } from "react";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { BookTimesNavigation } from "@/components/forms/book-times-navigation";
import { ServiceFieldset } from "@/components/forms/service-fieldset";
import { Field, SubmitButton } from "@/components/field";
import { prefetchAvailability } from "@/lib/scheduling/availability-cache";
import { AVAILABILITY_PREFETCH_DEBOUNCE_MS, availabilityQueryKey, canPrefetchAvailability } from "@/lib/scheduling/times-prefetch";

export function BookShootForm({
  address,
  placeId,
  services,
  notes,
  addressError,
  placesConfigured,
  modifyBookingId,
  fromAdmin = false,
}: {
  address: string;
  placeId?: string;
  services: string[];
  notes?: string;
  addressError?: string;
  placesConfigured: boolean;
  modifyBookingId?: string;
  fromAdmin?: boolean;
}) {
  const [typedAddress, setTypedAddress] = useState(address);
  const [typedPlaceId, setTypedPlaceId] = useState(placeId ?? "");
  const [pickedServices, setPickedServices] = useState(services);
  const query = useMemo(
    () => ({
      address: typedAddress,
      placeId: typedPlaceId,
      services: pickedServices,
      modify: modifyBookingId,
    }),
    [modifyBookingId, pickedServices, typedAddress, typedPlaceId],
  );
  const queryKey = availabilityQueryKey(query);

  useEffect(() => {
    if (!canPrefetchAvailability(query)) return;
    const timer = window.setTimeout(() => {
      void prefetchAvailability(query);
    }, AVAILABILITY_PREFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [queryKey, query]);

  return (
    <BookTimesNavigation>
      {modifyBookingId ? <input type="hidden" name="modify" value={modifyBookingId} /> : null}
      {fromAdmin ? <input type="hidden" name="fromAdmin" value="1" /> : null}
      <AddressAutocomplete
        defaultValue={address}
        defaultPlaceId={placeId}
        placesConfigured={placesConfigured}
        error={addressError}
        onAddressChange={(next) => {
          setTypedAddress(next.address);
          setTypedPlaceId(next.placeId);
        }}
      />
      <Field
        id="notes"
        name="notes"
        label="Notes (optional)"
        placeholder="Access info, lockbox, or other information"
        defaultValue={notes}
      />
      <ServiceFieldset
        selected={services}
        onSelectedChange={setPickedServices}
      />
      <SubmitButton>Continue</SubmitButton>
    </BookTimesNavigation>
  );
}
