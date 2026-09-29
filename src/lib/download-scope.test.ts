import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterFilesByZipTypes,
  parseZipTypesParam,
  presentMediaTypes,
  withZipTypes,
  zipDownloadOptions,
  zipScopeFolderName,
} from "./download-scope";

const files = [
  { filename: "Full-01.jpg", type: "photo" },
  { filename: "plan.svg", type: "floor_plan" },
  { filename: "walk.mp4", type: "video" },
];

test("lists present media types in a stable order", () => {
  assert.deepEqual(presentMediaTypes(files), ["photo", "floor_plan", "video"]);
  assert.deepEqual(presentMediaTypes([{ type: "photo" }, { type: "photo" }]), ["photo"]);
});

test("parses zip type query params", () => {
  assert.equal(parseZipTypesParam(null), "all");
  assert.equal(parseZipTypesParam("all"), "all");
  assert.deepEqual(parseZipTypesParam("photo"), ["photo"]);
  assert.deepEqual(parseZipTypesParam("photo,floor_plan"), ["photo", "floor_plan"]);
  assert.equal(parseZipTypesParam("nope"), "all");
});

test("filters files and names scoped zips", () => {
  assert.equal(filterFilesByZipTypes(files, ["floor_plan"]).length, 1);
  assert.equal(
    zipScopeFolderName("2026-09-04 - 12 Wood View Drive", "all", ["photo", "floor_plan"]),
    "2026-09-04 - 12 Wood View Drive",
  );
  assert.equal(
    zipScopeFolderName("2026-09-04 - 12 Wood View Drive", ["photo"], ["photo", "floor_plan"]),
    "2026-09-04 - 12 Wood View Drive - Photos",
  );
  assert.equal(withZipTypes("/api/s/tok/zip", ["photo"]), "/api/s/tok/zip?types=photo");
});

test("raw video is its own zip scope after finished video", () => {
  const withRaw = [...files, { filename: "Raw Video/A001.mov", type: "raw_video" as const }];
  assert.deepEqual(presentMediaTypes(withRaw), ["photo", "floor_plan", "video", "raw_video"]);
  assert.deepEqual(parseZipTypesParam("raw_video"), ["raw_video"]);
  assert.deepEqual(
    filterFilesByZipTypes(withRaw, ["raw_video"]).map((file) => file.filename),
    ["Raw Video/A001.mov"],
  );
  assert.deepEqual(
    filterFilesByZipTypes(withRaw, ["video"]).map((file) => file.filename),
    ["walk.mp4"],
  );
  assert.deepEqual(zipDownloadOptions(["photo", "video", "raw_video"]), [
    { id: "all", label: "Everything" },
    { id: "photo", label: "Photos" },
    { id: "video", label: "Video" },
    { id: "raw_video", label: "Raw video" },
  ]);
  assert.equal(
    zipScopeFolderName("2026-09-04 - 12 Wood View Drive", ["raw_video"], ["photo", "raw_video"]),
    "2026-09-04 - 12 Wood View Drive - Raw video",
  );
});

test("offers Everything plus each present type when mixed", () => {
  assert.deepEqual(zipDownloadOptions(["photo"]), [{ id: "photo", label: "Photos" }]);
  assert.deepEqual(zipDownloadOptions(["photo", "floor_plan"]), [
    { id: "all", label: "Everything" },
    { id: "photo", label: "Photos" },
    { id: "floor_plan", label: "Floor plans" },
  ]);
});
