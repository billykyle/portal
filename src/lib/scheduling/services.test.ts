import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSchedulingService, SCHEDULING_SERVICES } from "./services";

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
