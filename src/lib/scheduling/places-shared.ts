export const PLACES_MISSING_KEY_MESSAGE =
  "Address lookup is not connected (GOOGLE_MAPS_API_KEY). Enable Places Autocomplete (and Address Validation) on that key to show real suggestions. Geography is never guessed.";

export const PLACES_UNAVAILABLE_MESSAGE =
  "Address lookup is unavailable right now. Geography is never guessed — pick a suggestion when lookup is back, or enter the full street address.";

export type AddressSuggestion = {
  placeId: string;
  label: string;
  primaryText: string;
  secondaryText: string;
};

export type AddressSuggestResult = {
  configured: boolean;
  suggestions: AddressSuggestion[];
  error?: string;
};
