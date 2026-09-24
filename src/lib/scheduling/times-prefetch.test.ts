import assert from "node:assert/strict";
import { test } from "node:test";
import { TIMES_LOADING_COPY } from "./times-loading";
import {
  AVAILABILITY_PREFETCH_DEBOUNCE_MS,
  availabilityQueryKey,
  availabilitySearchParams,
  canPrefetchAvailability,
  displayedTimesState,
  isAvailabilityFresh,
  previousTimesForQuery,
  readAvailabilityQuery,
} from "./times-prefetch";

const slot = {
  start: "2026-09-21T14:00:00.000Z",
  end: "2026-09-21T14:45:00.000Z",
  dateKey: "2026-09-21",
  dateLabel: "Monday, Sep 21",
  timeLabel: "10:00 AM",
  driveSecondsFromPrior: null,
};

const availability = {
  address: "12 Wood View Drive, Princeton, NJ",
  timeZone: "America/New_York",
  calendarConfigured: true,
  driveTimeConfigured: true,
  firstBookableDate: "2026-09-21",
  lastBookableDate: "2026-12-21",
  notices: [],
  slots: [slot],
};

test("prefetch waits for a real street address and at least one service", () => {
  assert.equal(canPrefetchAvailability({ address: "", services: ["Real Estate · Photography"] }), false);
  assert.equal(canPrefetchAvailability({ address: "12 Wood View Drive", services: [] }), false);
  assert.equal(canPrefetchAvailability({ address: "12 Wood View Drive", services: ["Real Estate · Photography"] }), true);
});

test("availability query keys ignore service order and extra spaces", () => {
  assert.equal(
    availabilityQueryKey({
      address: "  12 Wood View Drive  ",
      services: ["Construction · Video", "Real Estate · Photography"],
    }),
    availabilityQueryKey({
      address: "12 Wood View Drive",
      services: ["Real Estate · Photography", "Construction · Video"],
    }),
  );
});

test("availability search params are stable for the API", () => {
  const params = availabilitySearchParams({
    address: "12 Wood View Drive",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography"],
    modify: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(params.get("address"), "12 Wood View Drive");
  assert.equal(params.get("placeId"), "ChIJ123");
  assert.deepEqual(params.getAll("service"), ["Real Estate · Photography"]);
  assert.equal(params.get("modify"), "11111111-1111-4111-8111-111111111111");
});

test("displayed times keep the last good slots while a refresh is in flight", () => {
  const refreshing = displayedTimesState({
    loading: true,
    current: null,
    previous: availability,
  });
  assert.equal(refreshing.availability, availability);
  assert.equal(refreshing.refreshing, true);
  assert.equal(refreshing.stale, true);
  assert.equal(refreshing.showLoadingScreen, false);

  const firstLoad = displayedTimesState({ loading: true, current: null, previous: null });
  assert.equal(firstLoad.showLoadingScreen, true);
  assert.equal(firstLoad.availability, null);

  const ready = displayedTimesState({ loading: false, current: availability, previous: availability });
  assert.equal(ready.refreshing, false);
  assert.equal(ready.showLoadingScreen, false);
});

test("a refresh only reuses slots from the same address and services", () => {
  const key = availabilityQueryKey({
    address: availability.address,
    services: ["Real Estate · Photography"],
    modify: "11111111-1111-4111-8111-111111111111",
  });
  const otherKey = availabilityQueryKey({
    address: "88 Tuesday Lane, Princeton, NJ",
    services: ["Real Estate · Photography"],
    modify: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(previousTimesForQuery(key, key, availability), availability);
  assert.equal(previousTimesForQuery(key, otherKey, availability), null);
  assert.equal(previousTimesForQuery(key, null, null), null);
});

test("fresh results are reused; stale results refresh", () => {
  assert.equal(isAvailabilityFresh(Date.now() - 1_000, Date.now(), 90_000), true);
  assert.equal(isAvailabilityFresh(Date.now() - 120_000, Date.now(), 90_000), false);
  assert.equal(AVAILABILITY_PREFETCH_DEBOUNCE_MS > 0, true);
});

test("readAvailabilityQuery pulls address, place, services, and modify", () => {
  const form = new FormData();
  form.set("address", "12 Wood View Drive");
  form.set("placeId", "ChIJ123");
  form.append("service", "Real Estate · Photography");
  form.set("modify", "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(readAvailabilityQuery(form), {
    address: "12 Wood View Drive",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography"],
    modify: "11111111-1111-4111-8111-111111111111",
  });
});

test("loading copy keeps the ellipsis", () => {
  assert.equal(TIMES_LOADING_COPY, "Loading your available times…");
});
