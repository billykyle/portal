import { parseShootAddress, type ParsedAddress } from "./address";
import { mapsApiKey } from "./config";
import {
  PLACES_MISSING_KEY_MESSAGE,
  PLACES_UNAVAILABLE_MESSAGE,
  type AddressSuggestion,
  type AddressSuggestResult,
} from "./places-shared";

export {
  PLACES_MISSING_KEY_MESSAGE,
  PLACES_UNAVAILABLE_MESSAGE,
  type AddressSuggestion,
  type AddressSuggestResult,
} from "./places-shared";

type PlacesNewAutocompleteBody = {
  error?: { message?: string; status?: string };
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type PlacesLegacyAutocompleteBody = {
  status?: string;
  error_message?: string;
  predictions?: Array<{
    place_id?: string;
    description?: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
};

type PlacesNewDetailsBody = {
  error?: { message?: string };
  formattedAddress?: string;
};

type PlacesLegacyDetailsBody = {
  status?: string;
  error_message?: string;
  result?: { formatted_address?: string };
};

type AddressValidationBody = {
  error?: { message?: string; status?: string };
  result?: {
    verdict?: {
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      validationGranularity?: string;
    };
    address?: { formattedAddress?: string };
  };
};

type TransportResult<T> =
  | { ok: true; value: T }
  | { ok: false; unavailable: boolean; error: string };

export function parsePlacesNewSuggestions(body: PlacesNewAutocompleteBody): AddressSuggestion[] {
  const suggestions: AddressSuggestion[] = [];
  for (const item of body.suggestions ?? []) {
    const prediction = item.placePrediction;
    const placeId = String(prediction?.placeId ?? "").trim();
    const label = String(prediction?.text?.text ?? "").replace(/\s+/g, " ").trim();
    if (!placeId || !label) continue;
    suggestions.push({
      placeId,
      label,
      primaryText: String(prediction?.structuredFormat?.mainText?.text ?? label).trim() || label,
      secondaryText: String(prediction?.structuredFormat?.secondaryText?.text ?? "").trim(),
    });
  }
  return suggestions;
}

export function parsePlacesLegacySuggestions(body: PlacesLegacyAutocompleteBody): AddressSuggestion[] {
  const suggestions: AddressSuggestion[] = [];
  for (const prediction of body.predictions ?? []) {
    const placeId = String(prediction.place_id ?? "").trim();
    const label = String(prediction.description ?? "").replace(/\s+/g, " ").trim();
    if (!placeId || !label) continue;
    suggestions.push({
      placeId,
      label,
      primaryText: String(prediction.structured_formatting?.main_text ?? label).trim() || label,
      secondaryText: String(prediction.structured_formatting?.secondary_text ?? "").trim(),
    });
  }
  return suggestions;
}

function googleErrorMessage(raw: string | undefined, fallback: string) {
  const message = String(raw ?? "").trim();
  return message || fallback;
}

async function suggestPlacesNew(
  key: string,
  input: string,
  sessionToken?: string,
): Promise<TransportResult<AddressSuggestion[]>> {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input,
      languageCode: "en",
      includedRegionCodes: ["us"],
      ...(sessionToken ? { sessionToken } : {}),
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as PlacesNewAutocompleteBody;
  if (!res.ok || body.error) {
    return {
      ok: false,
      unavailable: true,
      error: googleErrorMessage(body.error?.message, PLACES_UNAVAILABLE_MESSAGE),
    };
  }
  return { ok: true, value: parsePlacesNewSuggestions(body) };
}

async function suggestPlacesLegacy(
  key: string,
  input: string,
  sessionToken?: string,
): Promise<TransportResult<AddressSuggestion[]>> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", key);
  if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);

  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as PlacesLegacyAutocompleteBody;
  if (!res.ok || (body.status && body.status !== "OK" && body.status !== "ZERO_RESULTS")) {
    return {
      ok: false,
      unavailable: true,
      error: googleErrorMessage(body.error_message, PLACES_UNAVAILABLE_MESSAGE),
    };
  }
  return { ok: true, value: parsePlacesLegacySuggestions(body) };
}

/**
 * Real address suggestions from Google Places. Never invents a list when the
 * key is missing or the APIs fail.
 */
export async function suggestAddresses(
  raw: string,
  sessionToken?: string,
): Promise<AddressSuggestResult> {
  const key = mapsApiKey();
  if (!key) {
    return { configured: false, suggestions: [], error: PLACES_MISSING_KEY_MESSAGE };
  }

  const input = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (input.length < 3) {
    return { configured: true, suggestions: [] };
  }

  const next = await suggestPlacesNew(key, input, sessionToken);
  if (next.ok) return { configured: true, suggestions: next.value };

  const legacy = await suggestPlacesLegacy(key, input, sessionToken);
  if (legacy.ok) return { configured: true, suggestions: legacy.value };

  return {
    configured: true,
    suggestions: [],
    error: next.error || legacy.error || PLACES_UNAVAILABLE_MESSAGE,
  };
}

async function formatPlaceNew(key: string, placeId: string, sessionToken?: string) {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "formattedAddress",
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as PlacesNewDetailsBody;
  if (!res.ok || body.error) return null;
  const formatted = String(body.formattedAddress ?? "").replace(/\s+/g, " ").trim();
  return formatted || null;
}

async function formatPlaceLegacy(key: string, placeId: string, sessionToken?: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_address");
  url.searchParams.set("key", key);
  if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as PlacesLegacyDetailsBody;
  if (!res.ok || body.status !== "OK") return null;
  const formatted = String(body.result?.formatted_address ?? "").replace(/\s+/g, " ").trim();
  return formatted || null;
}

export async function formatPlaceAddress(placeId: string, sessionToken?: string) {
  const key = mapsApiKey();
  const id = String(placeId ?? "").trim();
  if (!key || !id) return null;
  return (await formatPlaceNew(key, id, sessionToken)) ?? (await formatPlaceLegacy(key, id, sessionToken));
}

async function validateTypedAddress(address: string): Promise<ParsedAddress | null> {
  const key = mapsApiKey();
  if (!key) return null;
  const url = new URL("https://addressvalidation.googleapis.com/v1:validateAddress");
  url.searchParams.set("key", key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: {
        regionCode: "US",
        addressLines: [address],
      },
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as AddressValidationBody;
  if (!res.ok || body.error) return null;
  const formatted = String(body.result?.address?.formattedAddress ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!formatted) return null;
  const parsed = parseShootAddress(formatted);
  if (!parsed.ok) return parsed;
  const verdict = body.result?.verdict;
  if (verdict && verdict.addressComplete === false) {
    return {
      ok: false,
      error: "That address is not a complete street address. Pick a suggestion or add city and ZIP.",
    };
  }
  return parsed;
}

/**
 * Address-first resolve for step 2. Uses Place Details / Address Validation
 * when Maps is connected; otherwise the typed string after {@link parseShootAddress}.
 * Never invents a street.
 */
export async function resolveBookAddress(
  raw: string,
  placeId?: string | null,
  sessionToken?: string,
): Promise<ParsedAddress> {
  const parsed = parseShootAddress(raw);
  if (!parsed.ok) return parsed;
  if (!mapsApiKey()) return parsed;

  if (placeId) {
    const formatted = await formatPlaceAddress(placeId, sessionToken);
    if (formatted) {
      const fromPlace = parseShootAddress(formatted);
      if (fromPlace.ok) return fromPlace;
    }
  }

  return (await validateTypedAddress(parsed.address)) ?? parsed;
}
