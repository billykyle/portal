import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShootAddress } from "./address";
import {
  formatPlaceAddress,
  parsePlacesLegacySuggestions,
  parsePlacesNewSuggestions,
  PLACES_MISSING_KEY_MESSAGE,
  resolveBookAddress,
  suggestAddresses,
} from "./places";

test("Places parsers only keep real placeId + formatted label pairs", () => {
  assert.deepEqual(
    parsePlacesNewSuggestions({
      suggestions: [
        {
          placePrediction: {
            placeId: "ChIJ123",
            text: { text: "12 Wood View Drive, Princeton, NJ, USA" },
            structuredFormat: {
              mainText: { text: "12 Wood View Drive" },
              secondaryText: { text: "Princeton, NJ, USA" },
            },
          },
        },
        { placePrediction: { placeId: "", text: { text: "Fake Lane" } } },
        { placePrediction: { placeId: "ChIJno", text: { text: "" } } },
      ],
    }),
    [
      {
        placeId: "ChIJ123",
        label: "12 Wood View Drive, Princeton, NJ, USA",
        primaryText: "12 Wood View Drive",
        secondaryText: "Princeton, NJ, USA",
      },
    ],
  );
  assert.deepEqual(
    parsePlacesLegacySuggestions({
      status: "OK",
      predictions: [
        {
          place_id: "ChIJ456",
          description: "1500 Market Street, Philadelphia, PA, USA",
          structured_formatting: {
            main_text: "1500 Market Street",
            secondary_text: "Philadelphia, PA, USA",
          },
        },
        { description: "Invented address" },
      ],
    }),
    [
      {
        placeId: "ChIJ456",
        label: "1500 Market Street, Philadelphia, PA, USA",
        primaryText: "1500 Market Street",
        secondaryText: "Philadelphia, PA, USA",
      },
    ],
  );
});

test("missing Maps key returns a clear message and no invented suggestions", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    throw new Error("should not call Google without a key");
  }) as typeof fetch;

  const result = await suggestAddresses("12 Wood View Drive");
  assert.equal(result.configured, false);
  assert.deepEqual(result.suggestions, []);
  assert.equal(result.error, PLACES_MISSING_KEY_MESSAGE);
  assert.equal(called, 0);
  assert.equal(await formatPlaceAddress("ChIJ123"), null);

  const resolved = await resolveBookAddress("12 Wood View Drive");
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.address, "12 Wood View Drive");

  globalThis.fetch = originalFetch;
  restoreEnv("GOOGLE_MAPS_API_KEY", previous);
});

test("suggestAddresses maps Places (New) predictions from Google", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    assert.match(url, /places\.googleapis\.com/);
    return new Response(
      JSON.stringify({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJ123",
              text: { text: "12 Wood View Drive, Princeton, NJ, USA" },
              structuredFormat: {
                mainText: { text: "12 Wood View Drive" },
                secondaryText: { text: "Princeton, NJ, USA" },
              },
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await suggestAddresses("12 Wood");
  assert.equal(result.configured, true);
  assert.equal(result.suggestions[0]?.placeId, "ChIJ123");
  assert.equal(result.suggestions[0]?.label, "12 Wood View Drive, Princeton, NJ, USA");
  assert.equal(result.error, undefined);

  globalThis.fetch = originalFetch;
  restoreEnv("GOOGLE_MAPS_API_KEY", previous);
});

test("suggestAddresses falls back to legacy Places when New API is down", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("places.googleapis.com")) {
      return new Response(JSON.stringify({ error: { message: "API not enabled" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    assert.match(url, /place\/autocomplete/);
    return new Response(
      JSON.stringify({
        status: "OK",
        predictions: [
          {
            place_id: "ChIJ789",
            description: "100 1st Avenue, Avalon, NJ, USA",
            structured_formatting: {
              main_text: "100 1st Avenue",
              secondary_text: "Avalon, NJ, USA",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await suggestAddresses("100 1st");
  assert.equal(result.configured, true);
  assert.equal(result.suggestions[0]?.placeId, "ChIJ789");
  assert.equal(result.suggestions[0]?.label, "100 1st Avenue, Avalon, NJ, USA");

  globalThis.fetch = originalFetch;
  restoreEnv("GOOGLE_MAPS_API_KEY", previous);
});

test("Places API failure returns no invented addresses", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: { message: "REQUEST_DENIED" } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await suggestAddresses("Main Street");
  assert.equal(result.configured, true);
  assert.deepEqual(result.suggestions, []);
  assert.match(result.error ?? "", /REQUEST_DENIED|unavailable/i);

  globalThis.fetch = originalFetch;
  restoreEnv("GOOGLE_MAPS_API_KEY", previous);
});

test("short queries do not hit Google", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const result = await suggestAddresses("12");
  assert.equal(result.configured, true);
  assert.deepEqual(result.suggestions, []);
  assert.equal(called, 0);

  globalThis.fetch = originalFetch;
  restoreEnv("GOOGLE_MAPS_API_KEY", previous);
});

test("resolveBookAddress prefers Place Details formatted address", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    assert.match(url, /places\.googleapis\.com\/v1\/places\/ChIJ123/);
    return new Response(JSON.stringify({ formattedAddress: "12 Wood View Drive, Princeton, NJ 08540, USA" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const resolved = await resolveBookAddress("12 Wood View", "ChIJ123");
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.address, "12 Wood View Drive, Princeton, NJ 08540, USA");
  }

  globalThis.fetch = originalFetch;
  restoreEnv("GOOGLE_MAPS_API_KEY", previous);
});

test("resolveBookAddress still requires a real street when Maps is off", () => {
  assert.equal(parseShootAddress("").ok, false);
  assert.equal(parseShootAddress("Main Street").ok, false);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
