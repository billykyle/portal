"use client";

import { useEffect, useMemo, useState } from "react";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { BookTimesNavigation } from "@/components/forms/book-times-navigation";
import { ServiceFieldset } from "@/components/forms/service-fieldset";
import { Field, SubmitButton } from "@/components/field";
import { prefetchAvailability } from "@/lib/scheduling/availability-cache";
import {
  COMMERCIAL_VIDEO_SERVICE,
  parseSchedulingServices,
} from "@/lib/scheduling/services";
import {
  AVAILABILITY_PREFETCH_DEBOUNCE_MS,
  availabilityQueriesForBooking,
  availabilityQueryKey,
  canPrefetchAvailability,
} from "@/lib/scheduling/times-prefetch";

export function BookShootForm({
  address,
  placeId,
  services,
  commercialHours = null,
  notes,
  addressError,
  placesConfigured,
  modifyBookingId,
  fromAdmin = false,
  allowedServices,
}: {
  address: string;
  placeId?: string;
  services: string[];
  commercialHours?: number | null;
  notes?: string;
  addressError?: string;
  placesConfigured: boolean;
  modifyBookingId?: string;
  fromAdmin?: boolean;
  /** Client scheduling passes the category allow-list. Admin omits it and sees every service. */
  allowedServices?: readonly string[];
}) {
  const pickerServices = limitPickerServices(services, allowedServices);
  const pickerHours = pickerServices.includes(COMMERCIAL_VIDEO_SERVICE) ? commercialHours : null;
  const [typedAddress, setTypedAddress] = useState(address);
  const [typedPlaceId, setTypedPlaceId] = useState(placeId ?? "");
  const [pickedServices, setPickedServices] = useState(pickerServices);
  const [pickedHours, setPickedHours] = useState<number | null>(pickerHours);
  const query = useMemo(
    () => ({
      address: typedAddress,
      placeId: typedPlaceId,
      services: pickedServices,
      commercialHours: pickedHours,
      modify: modifyBookingId,
    }),
    [modifyBookingId, pickedHours, pickedServices, typedAddress, typedPlaceId],
  );
  const queryKey = availabilityQueryKey(query);

  useEffect(() => {
    if (!canPrefetchAvailability(query)) return;
    const timer = window.setTimeout(() => {
      for (const next of availabilityQueriesForBooking(query)) {
        void prefetchAvailability(next);
      }
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
        selected={pickerServices}
        commercialHours={pickerHours}
        allowedServices={allowedServices}
        pairTwilight={!modifyBookingId}
        onSelectedChange={setPickedServices}
        onCommercialHoursChange={setPickedHours}
      />
      <SubmitButton>Continue</SubmitButton>
    </BookTimesNavigation>
  );
}

function limitPickerServices(services: readonly string[], allowedServices?: readonly string[]) {
  if (!allowedServices) return [...services];
  const allowed = new Set(allowedServices);
  return parseSchedulingServices(services).filter((service) => allowed.has(service));
}
