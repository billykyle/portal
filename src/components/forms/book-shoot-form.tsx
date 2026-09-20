import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { BookTimesNavigation } from "@/components/forms/book-times-navigation";
import { ServiceFieldset } from "@/components/forms/service-fieldset";
import { Field, SubmitButton } from "@/components/field";

export function BookShootForm({
  address,
  placeId,
  services,
  notes,
  addressError,
  placesConfigured,
}: {
  address: string;
  placeId?: string;
  services: string[];
  notes?: string;
  addressError?: string;
  placesConfigured: boolean;
}) {
  return (
    <BookTimesNavigation>
      <p className="text-sm text-[#8e8e93]">Step 1 of 2 — address and services</p>
      <AddressAutocomplete
        defaultValue={address}
        defaultPlaceId={placeId}
        placesConfigured={placesConfigured}
        error={addressError}
      />
      <Field
        id="notes"
        name="notes"
        label="Notes (optional)"
        placeholder="Lockbox, contact, …"
        defaultValue={notes}
      />
      <ServiceFieldset selected={services} />
      <SubmitButton>Continue</SubmitButton>
    </BookTimesNavigation>
  );
}
