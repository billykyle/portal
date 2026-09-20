import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingServiceList,
  formatBookingServices,
  formatSchedulingService,
  isExclusiveIndustry,
  parseSchedulingService,
  parseSchedulingServices,
  SCHEDULING_INDUSTRIES,
  SCHEDULING_SERVICES,
  schedulingServiceId,
  toggleSchedulingService,
} from "./services";

test("scheduling services are Billy's industry catalog", () => {
  assert.deepEqual(
    SCHEDULING_INDUSTRIES.map((group) => ({
      industry: group.industry,
      options: [...group.options],
      exclusive: isExclusiveIndustry(group),
    })),
    [
      {
        industry: "Real Estate",
        options: ["Photography", "Video", "Aerial Photos", "Zillow 360"],
        exclusive: false,
      },
      {
        industry: "Construction",
        options: ["Photography", "Video"],
        exclusive: false,
      },
      {
        industry: "Podcast",
        options: ["1 episode", "2 episodes"],
        exclusive: true,
      },
    ],
  );
  assert.deepEqual(SCHEDULING_SERVICES, [
    "Real Estate · Photography",
    "Real Estate · Video",
    "Real Estate · Aerial Photos",
    "Real Estate · Zillow 360",
    "Construction · Photography",
    "Construction · Video",
    "Podcast · 1 episode",
    "Podcast · 2 episodes",
  ]);
  assert.equal(SCHEDULING_SERVICES.length, 8);
  assert.equal(schedulingServiceId("Real Estate", "Photography"), "Real Estate · Photography");
  assert.equal(schedulingServiceId("Podcast", "1 episode"), "Podcast · 1 episode");
});

test("parseSchedulingService keeps the canonical industry · option label", () => {
  assert.equal(parseSchedulingService("Real Estate · Photography"), "Real Estate · Photography");
  assert.equal(parseSchedulingService("  Construction · Video  "), "Construction · Video");
  assert.equal(parseSchedulingService("Real Estate · Zillow 360"), "Real Estate · Zillow 360");
  assert.equal(parseSchedulingService("Podcast · 1 episode"), "Podcast · 1 episode");
  assert.equal(parseSchedulingService("  Podcast · 2 episodes  "), "Podcast · 2 episodes");
  assert.equal(parseSchedulingService(""), null);
  assert.equal(parseSchedulingService("   "), null);
  assert.equal(parseSchedulingService("Wedding"), null);
  assert.equal(parseSchedulingService("real estate · photography"), null);
  assert.equal(parseSchedulingService("Photography"), null);
});

test("parseSchedulingService maps the retired flat labels", () => {
  assert.equal(parseSchedulingService("Real Estate Photography"), "Real Estate · Photography");
  assert.equal(parseSchedulingService("Real Estate Videography"), "Real Estate · Video");
  assert.equal(parseSchedulingService("Aerial Photography"), "Real Estate · Aerial Photos");
  assert.equal(parseSchedulingService("Zillow 3D Tour"), "Real Estate · Zillow 360");
  assert.equal(parseSchedulingService("Construction Photography"), "Construction · Photography");
  assert.equal(parseSchedulingService("Construction Videography"), "Construction · Video");
  assert.equal(parseSchedulingService("FPV"), null);
  assert.equal(parseSchedulingService("Commercial Photography"), null);
});

test("parseSchedulingServices keeps allowlist order, uniqueness, and rejects empty", () => {
  assert.deepEqual(
    parseSchedulingServices([
      "Construction · Video",
      "Real Estate · Photography",
      "Construction · Video",
      "Wedding",
    ]),
    ["Real Estate · Photography", "Construction · Video"],
  );
  assert.deepEqual(parseSchedulingServices("Real Estate · Aerial Photos"), [
    "Real Estate · Aerial Photos",
  ]);
  assert.deepEqual(parseSchedulingServices(["Zillow 3D Tour", "Real Estate Photography"]), [
    "Real Estate · Photography",
    "Real Estate · Zillow 360",
  ]);
  assert.deepEqual(parseSchedulingServices(["", "   ", "Wedding"]), []);
  assert.deepEqual(parseSchedulingServices(null), []);
  assert.deepEqual(parseSchedulingServices(undefined), []);
  assert.deepEqual(
    parseSchedulingServices(["Podcast · 2 episodes", "Real Estate · Photography", "Podcast · 1 episode"]),
    ["Real Estate · Photography", "Podcast · 1 episode"],
  );
});

test("bookingServiceList prefers the services array and keeps industry context", () => {
  assert.deepEqual(
    bookingServiceList({
      services: ["Construction · Video", "Real Estate · Photography"],
      service: "Real Estate Photography",
    }),
    ["Construction · Video", "Real Estate · Photography"],
  );
  assert.deepEqual(bookingServiceList({ service: "Construction Photography" }), [
    "Construction · Photography",
  ]);
  assert.deepEqual(bookingServiceList({ services: [], service: null }), []);
  assert.deepEqual(bookingServiceList({ services: ["FPV", "Real Estate · Video"] }), [
    "FPV",
    "Real Estate · Video",
  ]);
  assert.equal(
    formatBookingServices(["Real Estate · Photography", "Construction · Video"]),
    "Real Estate · Photography, Construction · Video",
  );
  assert.equal(formatSchedulingService("Aerial Photography"), "Real Estate · Aerial Photos");
  assert.equal(
    formatBookingServices(["Podcast · 2 episodes", "Construction · Photography"]),
    "Podcast · 2 episodes, Construction · Photography",
  );
});

test("toggleSchedulingService is exclusive inside Podcast and multi-select elsewhere", () => {
  assert.deepEqual(toggleSchedulingService([], "Podcast · 1 episode"), ["Podcast · 1 episode"]);
  assert.deepEqual(toggleSchedulingService(["Podcast · 1 episode"], "Podcast · 2 episodes"), [
    "Podcast · 2 episodes",
  ]);
  assert.deepEqual(toggleSchedulingService(["Podcast · 2 episodes"], "Podcast · 2 episodes"), []);
  assert.deepEqual(
    toggleSchedulingService(["Real Estate · Photography", "Podcast · 1 episode"], "Podcast · 2 episodes"),
    ["Real Estate · Photography", "Podcast · 2 episodes"],
  );
  assert.deepEqual(
    toggleSchedulingService(["Real Estate · Photography"], "Real Estate · Video"),
    ["Real Estate · Photography", "Real Estate · Video"],
  );
});
