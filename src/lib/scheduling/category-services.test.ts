import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_CATEGORIES } from "@/lib/client-category";
import {
  CLIENT_CATEGORY_SERVICES,
  clientCategoryServiceError,
  limitServicesToCategory,
  servicesForClientCategory,
} from "./category-services";
import {
  MEETING_30,
  MEETING_60,
  SCHEDULING_SERVICES,
  SOCIAL_MEDIA_LONG_FORM,
  SOCIAL_MEDIA_MONTHLY_BATCH,
} from "./services";

const SHARED = [
  SOCIAL_MEDIA_MONTHLY_BATCH,
  SOCIAL_MEDIA_LONG_FORM,
  MEETING_30,
  MEETING_60,
] as const;

test("each client category keeps Social Media Video and Meeting, plus its own services", () => {
  assert.deepEqual(CLIENT_CATEGORY_SERVICES.real_estate, [
    "Real Estate · Photography",
    "Real Estate · Video",
    "Real Estate · Aerial Photos",
    "Real Estate · Zillow 360",
    "Real Estate · Exterior Only",
    ...SHARED,
  ]);
  assert.deepEqual(CLIENT_CATEGORY_SERVICES.construction, [
    "Construction · Photography",
    "Construction · Video",
    ...SHARED,
  ]);
  assert.deepEqual(CLIENT_CATEGORY_SERVICES.podcast, [
    "Podcast · 1 episode",
    "Podcast · 2 episodes",
    ...SHARED,
  ]);
  assert.deepEqual(CLIENT_CATEGORY_SERVICES.commercial, ["Commercial video", ...SHARED]);
  assert.deepEqual(CLIENT_CATEGORY_SERVICES.other, SCHEDULING_SERVICES);

  for (const category of CLIENT_CATEGORIES) {
    const services = servicesForClientCategory(category);
    for (const shared of SHARED) {
      assert.ok(services.includes(shared), `${category} includes ${shared}`);
    }
  }
});

test("a missing or unknown category sees every service, including other", () => {
  assert.deepEqual(servicesForClientCategory(null), SCHEDULING_SERVICES);
  assert.deepEqual(servicesForClientCategory(undefined), SCHEDULING_SERVICES);
  assert.deepEqual(servicesForClientCategory(""), SCHEDULING_SERVICES);
  assert.deepEqual(servicesForClientCategory("listing"), SCHEDULING_SERVICES);
  assert.deepEqual(servicesForClientCategory("other"), SCHEDULING_SERVICES);
});

test("real estate cannot book podcast, construction, or commercial video", () => {
  assert.equal(
    clientCategoryServiceError(["Real Estate · Photography", "Meeting · 30 min appointment"], "real_estate"),
    null,
  );
  assert.equal(
    clientCategoryServiceError(["Podcast · 1 episode"], "real_estate"),
    "Podcast · 1 episode is not available for this account.",
  );
  assert.equal(
    clientCategoryServiceError(
      ["Construction · Video", "Commercial video"],
      "real_estate",
    ),
    "Those services are not available for this account.",
  );
  assert.deepEqual(
    limitServicesToCategory(
      ["Podcast · 1 episode", "Real Estate · Video", "Commercial video"],
      "real_estate",
    ),
    ["Real Estate · Video"],
  );
});

test("construction, podcast, and commercial stay on their own services", () => {
  assert.equal(clientCategoryServiceError(["Construction · Photography"], "construction"), null);
  assert.equal(
    clientCategoryServiceError(["Real Estate · Aerial Photos"], "construction"),
    "Real Estate · Aerial Photos is not available for this account.",
  );
  assert.equal(
    clientCategoryServiceError(["Real Estate · Exterior Only"], "construction"),
    "Real Estate · Exterior Only is not available for this account.",
  );
  assert.equal(clientCategoryServiceError(["Real Estate · Exterior Only"], "real_estate"), null);
  assert.equal(clientCategoryServiceError(["Real Estate · Exterior Only"], "other"), null);
  assert.equal(clientCategoryServiceError(["Real Estate · Exterior Only"], null), null);
  assert.equal(clientCategoryServiceError(["Podcast · 2 episodes"], "podcast"), null);
  assert.equal(
    clientCategoryServiceError(["Construction · Video"], "podcast"),
    "Construction · Video is not available for this account.",
  );
  assert.equal(clientCategoryServiceError(["Commercial video"], "commercial"), null);
  assert.equal(
    clientCategoryServiceError(["Real Estate · Photography"], "commercial"),
    "Real Estate · Photography is not available for this account.",
  );
  assert.equal(clientCategoryServiceError(["Podcast · 1 episode"], "other"), null);
  assert.equal(clientCategoryServiceError(["Podcast · 1 episode"], null), null);
});
