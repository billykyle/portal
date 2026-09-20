import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingServiceList,
  formatBookingServices,
  formatSchedulingService,
  parseSchedulingService,
  parseSchedulingServices,
  SCHEDULING_INDUSTRIES,
  SCHEDULING_SERVICES,
  schedulingServiceId,
} from "./services";

test("scheduling services are Billy's industry catalog", () => {
  assert.deepEqual(
    SCHEDULING_INDUSTRIES.map((group) => ({
      industry: group.industry,
      options: [...group.options],
    })),
    [
      {
        industry: "Real Estate",
        options: ["Photography", "Video", "Aerial Photos", "Zillow 360"],
      },
      {
        industry: "Construction",
        options: ["Photography", "Video"],
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
  ]);
  assert.equal(SCHEDULING_SERVICES.length, 6);
  assert.equal(schedulingServiceId("Real Estate", "Photography"), "Real Estate · Photography");
});

test("parseSchedulingService keeps the canonical industry · option label", () => {
  assert.equal(parseSchedulingService("Real Estate · Photography"), "Real Estate · Photography");
  assert.equal(parseSchedulingService("  Construction · Video  "), "Construction · Video");
  assert.equal(parseSchedulingService("Real Estate · Zillow 360"), "Real Estate · Zillow 360");
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
});
