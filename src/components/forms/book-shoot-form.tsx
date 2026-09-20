import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { ServiceFieldset } from "@/components/forms/service-fieldset";
import { SubmitButton } from "@/components/field";
import { CLIENT_SCHEDULING_TIMES } from "@/lib/routes";

export function BookShootForm({
  address,
  placeId,
  services,
  addressError,
  placesConfigured,
}: {
  address: string;
  placeId?: string;
  services: string[];
  addressError?: string;
  placesConfigured: boolean;
}) {
  return (
    <form action={CLIENT_SCHEDULING_TIMES} method="get" className="flex flex-col gap-4">
      <p className="text-sm text-[#8e8e93]">Step 1 of 2 — services and address</p>
      <ServiceFieldset selected={services} />
      <AddressAutocomplete
        defaultValue={address}
        defaultPlaceId={placeId}
        placesConfigured={placesConfigured}
        error={addressError}
      />
      <SubmitButton>Continue</SubmitButton>
    </form>
  );
}
