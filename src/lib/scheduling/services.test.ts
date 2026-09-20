import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingServiceList,
  formatBookingServices,
  parseSchedulingService,
  parseSchedulingServices,
  SCHEDULING_SERVICES,
} from "./services";

test("scheduling services are the v1 allowlist", () => {
  assert.deepEqual(SCHEDULING_SERVICES, [
    "Real Estate Photography",
    "Real Estate Videography",
    "Aerial Photography",
    "Aerial Videography",
    "FPV",
    "Construction Photography",
    "Construction Videography",
    "Commercial Photography",
    "Commercial Videography",
    "Aerial Inspection",
    "Marketing / Social Video",
    "Branding / Headshots",
    "Floor Plans (2D / 3D)",
    "Zillow 3D Tour",
    "Other / Custom",
  ]);
  assert.equal(SCHEDULING_SERVICES.length, 15);
});

test("parseSchedulingService keeps the canonical label and rejects unknown values", () => {
  assert.equal(parseSchedulingService("Real Estate Photography"), "Real Estate Photography");
  assert.equal(parseSchedulingService("  Floor Plans (2D / 3D)  "), "Floor Plans (2D / 3D)");
  assert.equal(parseSchedulingService("Marketing / Social Video"), "Marketing / Social Video");
  assert.equal(parseSchedulingService(""), null);
  assert.equal(parseSchedulingService("   "), null);
  assert.equal(parseSchedulingService("Wedding"), null);
  assert.equal(parseSchedulingService("real estate photography"), null);
});

test("parseSchedulingServices keeps allowlist order, uniqueness, and rejects empty", () => {
  assert.deepEqual(
    parseSchedulingServices(["Zillow 3D Tour", "Real Estate Photography", "Zillow 3D Tour", "Wedding"]),
    ["Real Estate Photography", "Zillow 3D Tour"],
  );
  assert.deepEqual(parseSchedulingServices("Aerial Photography"), ["Aerial Photography"]);
  assert.deepEqual(parseSchedulingServices(["", "   ", "Wedding"]), []);
  assert.deepEqual(parseSchedulingServices(null), []);
  assert.deepEqual(parseSchedulingServices(undefined), []);
});

test("bookingServiceList prefers the services array and falls back to a single service", () => {
  assert.deepEqual(
    bookingServiceList({
      services: ["Aerial Videography", "FPV"],
      service: "Real Estate Photography",
    }),
    ["Aerial Videography", "FPV"],
  );
  assert.deepEqual(bookingServiceList({ service: "Branding / Headshots" }), ["Branding / Headshots"]);
  assert.deepEqual(bookingServiceList({ services: [], service: null }), []);
  assert.equal(
    formatBookingServices(["Real Estate Photography", "Floor Plans (2D / 3D)"]),
    "Real Estate Photography · Floor Plans (2D / 3D)",
  );
});
