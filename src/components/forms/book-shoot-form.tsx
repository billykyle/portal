import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { ServiceFieldset } from "@/components/forms/service-fieldset";
import { Field, SubmitButton } from "@/components/field";
import { CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

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
    <form action={CLIENT_SCHEDULING_TIMES} method="get" className="flex flex-col gap-4">
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
    </form>
  );
}
